using System.Text.Json;
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

app.MapGet("/api/events", (int? page, int? pageSize, string? category, string? dateFilter, string? sort) => {
    var list = events.AsEnumerable();

    // filters
    if(!string.IsNullOrWhiteSpace(category)) list = list.Where(e => string.Equals(e.Category, category, StringComparison.OrdinalIgnoreCase));
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
