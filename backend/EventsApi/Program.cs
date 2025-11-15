using System.Text.Json;
using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Allow simple CORS from localhost/dev servers
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevPolicy", b =>
    {
        b.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

builder.Services.Configure<JsonOptions>(opts => {
    opts.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var app = builder.Build();
app.UseCors("DevPolicy");

// Load events once on startup
var dataPath = Path.Combine(AppContext.BaseDirectory, "events.json");
if(!File.Exists(dataPath)){
    // try relative path up a few levels (when running from bin/Debug)
    var tryPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "events", "events.json");
    tryPath = Path.GetFullPath(tryPath);
    if(File.Exists(tryPath)) dataPath = tryPath;
}

if(!File.Exists(dataPath)){
    Console.WriteLine("Could not find events.json. Place events.json next to the app or in the repo /events folder.");
}

var events = new List<EventItem>();
try{
    var txt = File.ReadAllText(dataPath);
    var deserOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
    events = JsonSerializer.Deserialize<List<EventItem>>(txt, deserOpts) ?? new List<EventItem>();

    // Ensure every event has Contact, Email and Program populated (generate reasonable defaults)
    foreach(var ev in events){
        if(string.IsNullOrWhiteSpace(ev.Contact)){
            // phone pattern: +40 7XX AAA BBB (create deterministic per id)
            var a = (100 + (ev.Id * 7) % 900).ToString();
            var b = (200 + (ev.Id * 13) % 800).ToString();
            ev.Contact = $"+40 {700 + (ev.Id % 30)} {a} {b}";
        }
        if(string.IsNullOrWhiteSpace(ev.Email)){
            // sanitize title to create email
            var name = new string((ev.Title ?? "event").ToLowerInvariant().Where(c=>char.IsLetterOrDigit(c) || c==' ').ToArray()).Trim().Replace(' ','-');
            if(string.IsNullOrWhiteSpace(name)) name = $"event-{ev.Id}";
            ev.Email = $"{name}@citybeat.local";
        }
        if(ev.Program == null || ev.Program.Count == 0){
            // generate a small program based on date/time and category
            ev.Program = new List<ProgramSection>();
            var s1 = new ProgramSection(){ Title = "Main", Items = new List<string>{ ev.Time + " — Opening/Intro", ev.Short.Length>60? ev.Short.Substring(0,60)+"...": ev.Short } };
            var s2 = new ProgramSection(){ Title = "Highlights", Items = new List<string>{ "Speaker session", "Q&A" } };
            ev.Program.Add(s1); ev.Program.Add(s2);
        }
    }

    // Persist back to dataPath to keep the enriched data
    try{
        var writeOpts = new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        File.WriteAllText(dataPath, JsonSerializer.Serialize(events, writeOpts));
        // also attempt to update repo copy if different
        var repoPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "events", "events.json"));
        if(repoPath != null && File.Exists(repoPath)){
            File.WriteAllText(repoPath, JsonSerializer.Serialize(events, writeOpts));
        }
    }
    catch(Exception ex){
        Console.WriteLine("Warning: failed to persist enriched events.json: " + ex.Message);
    }
}
catch(Exception ex){
    Console.WriteLine("Failed to read/parse events.json: " + ex.Message);
}

// --- Simple user store for favorites/saved/notifications ---
var userStorePath = Path.Combine(AppContext.BaseDirectory, "userstore.json");
UserStore store = new UserStore();
var storeLock = new object();
if(File.Exists(userStorePath)){
    try{
        var txt = File.ReadAllText(userStorePath);
        store = JsonSerializer.Deserialize<UserStore>(txt, new JsonSerializerOptions{ PropertyNameCaseInsensitive = true }) ?? new UserStore();
    }catch{}
}

void PersistStore(){
    try{
        lock(storeLock){
            var opts = new JsonSerializerOptions{ WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            File.WriteAllText(userStorePath, JsonSerializer.Serialize(store, opts));
        }
    }catch(Exception ex){ Console.WriteLine("Warning: failed to persist userstore: " + ex.Message); }
}

// helper to ensure a user record exists
UserRecord EnsureUser(string user){
    lock(storeLock){
        if(string.IsNullOrWhiteSpace(user)) user = "demo";
        if(!store.Users.ContainsKey(user)) store.Users[user] = new UserRecord();
        return store.Users[user];
    }
}

app.MapGet("/api/user/{user}/actions", (string user) => {
    var rec = EnsureUser(user);
    return Results.Json(new { favorites = rec.Favorites, saved = rec.Saved, notifications = rec.Notifications });
});

app.MapGet("/api/user/{user}/notifications", (string user) => {
    var rec = EnsureUser(user);
    // return most recent first
    var list = rec.Notifications.OrderByDescending(n=>n.Timestamp).ToList();
    return Results.Json(list);
});

app.MapPost("/api/user/{user}/favorite", async (HttpRequest req, string user) => {
    var rec = EnsureUser(user);
    using var sr = new StreamReader(req.Body);
    var body = await sr.ReadToEndAsync();
    try{
        var doc = JsonSerializer.Deserialize<Dictionary<string,int>>(body);
        if(doc != null && doc.TryGetValue("eventId", out var eventId)){
            lock(storeLock){
                var evTitleFav = events.FirstOrDefault(x=> x.Id == eventId)?.Title ?? $"event {eventId}";
                if(rec.Favorites.Contains(eventId)){
                    rec.Favorites.Remove(eventId);
                    rec.Notifications.Add(new Notification{ Id = Guid.NewGuid().ToString(), Timestamp = DateTime.UtcNow, Message = $"Removed from favorites: {evTitleFav}", EventId = eventId, Read = false });
                } else {
                    rec.Favorites.Add(eventId);
                    rec.Notifications.Add(new Notification{ Id = Guid.NewGuid().ToString(), Timestamp = DateTime.UtcNow, Message = $"Added to favorites: {evTitleFav}", EventId = eventId, Read = false });
                }
                PersistStore();
            }
            return Results.Ok(new { favorites = rec.Favorites });
        }
    }catch{}
    return Results.BadRequest();
});

app.MapPost("/api/user/{user}/save", async (HttpRequest req, string user) => {
    var rec = EnsureUser(user);
    using var sr = new StreamReader(req.Body);
    var body = await sr.ReadToEndAsync();
    try{
        var doc = JsonSerializer.Deserialize<Dictionary<string,int>>(body);
        if(doc != null && doc.TryGetValue("eventId", out var eventId)){
            lock(storeLock){
                var evTitleSave = events.FirstOrDefault(x=> x.Id == eventId)?.Title ?? $"event {eventId}";
                if(rec.Saved.Contains(eventId)){
                    rec.Saved.Remove(eventId);
                    rec.Notifications.Add(new Notification{ Id = Guid.NewGuid().ToString(), Timestamp = DateTime.UtcNow, Message = $"Removed from saved: {evTitleSave}", EventId = eventId, Read = false });
                } else {
                    rec.Saved.Add(eventId);
                    rec.Notifications.Add(new Notification{ Id = Guid.NewGuid().ToString(), Timestamp = DateTime.UtcNow, Message = $"Saved event: {evTitleSave}", EventId = eventId, Read = false });
                }
                PersistStore();
            }
            return Results.Ok(new { saved = rec.Saved });
        }
    }catch{}
    return Results.BadRequest();
});

app.MapPost("/api/user/{user}/reserve", async (HttpRequest req, string user) => {
    var rec = EnsureUser(user);
    using var sr = new StreamReader(req.Body);
    var body = await sr.ReadToEndAsync();
    try{
        var doc = JsonSerializer.Deserialize<Dictionary<string,int>>(body);
        if(doc != null && doc.TryGetValue("eventId", out var eventId)){
            lock(storeLock){
                // store as reserved in Reserved list
                var evTitleRes = events.FirstOrDefault(x=> x.Id == eventId)?.Title ?? $"event {eventId}";
                if(!rec.Reserved.Contains(eventId)){
                    rec.Reserved.Add(eventId);
                    rec.Notifications.Add(new Notification{ Id = Guid.NewGuid().ToString(), Timestamp = DateTime.UtcNow, Message = $"Reserved a ticket for {evTitleRes}", EventId = eventId, Read = false });
                }
                PersistStore();
            }
            return Results.Ok(new { reserved = rec.Reserved });
        }
    }catch{}
    return Results.BadRequest();
});

app.MapPost("/api/user/{user}/notifications/markread", async (HttpRequest req, string user) => {
    var rec = EnsureUser(user);
    using var sr = new StreamReader(req.Body);
    var body = await sr.ReadToEndAsync();
    try{
        var doc = JsonSerializer.Deserialize<Dictionary<string,string>>(body);
        if(doc != null && doc.TryGetValue("id", out var id)){
            lock(storeLock){
                var n = rec.Notifications.FirstOrDefault(x=>x.Id == id);
                if(n != null) n.Read = true;
                PersistStore();
            }
            return Results.Ok();
        }
    }catch{}
    return Results.BadRequest();
});


app.MapGet("/api/events", (int? page, int? pageSize, string? category, string? dateFilter, string? sort, string? q, string? loc) => {
    var list = events.AsEnumerable();

    // filters
    if(!string.IsNullOrWhiteSpace(category)) list = list.Where(e => string.Equals(e.Category, category, StringComparison.OrdinalIgnoreCase));
    // title search (partial, case-insensitive contains match)
    if(!string.IsNullOrWhiteSpace(q)){
        list = list.Where(e => !string.IsNullOrWhiteSpace(e.Title) && e.Title.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0);
    }
    // location search (partial match against city or venue)
    if(!string.IsNullOrWhiteSpace(loc)){
        list = list.Where(e => (!string.IsNullOrWhiteSpace(e.City) && e.City.IndexOf(loc, StringComparison.OrdinalIgnoreCase) >= 0) || (!string.IsNullOrWhiteSpace(e.Venue) && e.Venue.IndexOf(loc, StringComparison.OrdinalIgnoreCase) >= 0));
    }
    // use DateOnly for accurate day-only comparisons
    var nowDate = DateOnly.FromDateTime(DateTime.UtcNow);
    if(!string.IsNullOrWhiteSpace(dateFilter)){
        if(dateFilter == "today"){
            list = list.Where(e => DateOnly.Parse(e.Date) == nowDate);
        } else if(dateFilter == "7days" || dateFilter == "next7"){
            list = list.Where(e => {
                var d = DateOnly.Parse(e.Date);
                var diff = d.ToDateTime(TimeOnly.MinValue) - nowDate.ToDateTime(TimeOnly.MinValue);
                return diff.TotalDays >= 0 && diff.TotalDays <= 7;
            });
        }
    }

    // sort
    if(!string.IsNullOrWhiteSpace(sort)){
        switch(sort){
            case "date-asc": list = list.OrderBy(e => DateOnly.Parse(e.Date)); break;
            case "date-desc": list = list.OrderByDescending(e => DateOnly.Parse(e.Date)); break;
            case "title-asc": list = list.OrderBy(e => e.Title); break;
            case "title-desc": list = list.OrderByDescending(e => e.Title); break;
        }
    }

    var total = list.Count();
    var p = page.GetValueOrDefault(1);
    var ps = pageSize.GetValueOrDefault(6);
    p = Math.Max(1, p);
    ps = Math.Max(1, ps);

    var items = list.Skip((p-1)*ps).Take(ps).ToList();

    return Results.Json(new { total, page = p, pageSize = ps, items });
});

// endpoint providing city suggestions (distinct cities derived from events)
app.MapGet("/api/events/cities", (int? page, int? pageSize, string? q) => {
    // collect distinct city names
    var cities = events.Select(e => (e.City ?? string.Empty).Trim())
                       .Where(s => !string.IsNullOrWhiteSpace(s))
                       .Distinct(StringComparer.OrdinalIgnoreCase)
                       .Select(name => new {
                           name,
                           count = events.Count(ev => string.Equals((ev.City ?? string.Empty).Trim(), name, StringComparison.OrdinalIgnoreCase))
                       })
                       .OrderBy(c => c.name, StringComparer.OrdinalIgnoreCase)
                       .ToList();

    if(!string.IsNullOrWhiteSpace(q)){
        // diacritics-insensitive match
        var qnorm = RemoveDiacritics(q).ToLowerInvariant();
        cities = cities.Where(c => RemoveDiacritics(c.name).ToLowerInvariant().Contains(qnorm)).ToList();
    }

    var total = cities.Count;
    var p = page.GetValueOrDefault(1);
    var ps = pageSize.GetValueOrDefault(20);
    p = Math.Max(1, p);
    ps = Math.Max(1, ps);
    var items = cities.Skip((p-1)*ps).Take(ps).ToList();

    return Results.Json(new { total, page = p, pageSize = ps, items });
});

static string RemoveDiacritics(string text){
    if(string.IsNullOrWhiteSpace(text)) return text ?? string.Empty;
    var normalized = text.Normalize(NormalizationForm.FormD);
    var sb = new StringBuilder();
    foreach(var ch in normalized){
        var uc = CharUnicodeInfo.GetUnicodeCategory(ch);
        if(uc != UnicodeCategory.NonSpacingMark) sb.Append(ch);
    }
    return sb.ToString().Normalize(NormalizationForm.FormC);
}

// lightweight categories endpoint (useful for populating dropdowns)
app.MapGet("/api/events/categories", () => {
    var cats = events.Select(e => e.Category ?? string.Empty)
                     .Where(c => !string.IsNullOrWhiteSpace(c))
                     .Distinct(StringComparer.OrdinalIgnoreCase)
                     .OrderBy(c => c)
                     .ToList();
    return Results.Json(cats);
});

app.MapGet("/", () => Results.Redirect("/api/events"));

app.Run();


public class EventItem{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty; // yyyy-MM-dd
    public string Time { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Venue { get; set; } = string.Empty;
    public string Thumb { get; set; } = string.Empty;
    public string Short { get; set; } = string.Empty;
    // optional contact metadata
    public string Contact { get; set; } = string.Empty; // phone or contact string
    public string Email { get; set; } = string.Empty;
    // optional program sections
    public List<ProgramSection> Program { get; set; } = new List<ProgramSection>();
}

public class ProgramSection{
    public string Title { get; set; } = string.Empty;
    public List<string> Items { get; set; } = new List<string>();
}

// Simple user store models
public class UserStore{
    public Dictionary<string, UserRecord> Users { get; set; } = new Dictionary<string, UserRecord>(StringComparer.OrdinalIgnoreCase);
}

public class UserRecord{
    public List<int> Favorites { get; set; } = new List<int>();
    public List<int> Saved { get; set; } = new List<int>();
    public List<int> Reserved { get; set; } = new List<int>();
    public List<Notification> Notifications { get; set; } = new List<Notification>();
}

public class Notification{
    public string Id { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public string Message { get; set; } = string.Empty;
    public int EventId { get; set; }
    public bool Read { get; set; } = false;
}
