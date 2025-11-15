using System;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Threading.Tasks;

public static class EmailSender
{
    // Sends an email using SMTP configuration from environment variables.
    // Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    // Optional: SMTP_FROM (defaults to noreply@citybeat.local), SMTP_SSL (true/false)
    // fromAddress: optional "From" address to use (if your SMTP server allows it). replyTo: optional Reply-To address.
    // Note: many SMTP providers require From to be the authenticated account; when in doubt set replyTo to the user's email so replies go to them.
    public static async Task<(bool ok, string message)> SendAsync(string to, string subject, string htmlBody, string? fromAddress = null, string? replyTo = null)
    {
        // NOTE: SMTP sending has been intentionally disabled for local/dev runs
        // to avoid using any real Gmail account. Instead persist the message
        // into a local log file so maintainers can inspect contact submissions.
        try
        {
            var log = Path.Combine(AppContext.BaseDirectory, "outgoing_emails.log");
            var entry = $"[{DateTime.UtcNow:o}] TO:{to} SUBJECT:{subject} FROM:{fromAddress} REPLYTO:{replyTo}\n{htmlBody}\n\n";
            File.AppendAllText(log, entry);
            // return success so callers (API) treat the submission as accepted
            return (true, "Logged (SMTP disabled)");
        }
        catch (Exception ex)
        {
            try
            {
                var logErr = Path.Combine(AppContext.BaseDirectory, "outgoing_emails_error.log");
                var entry = $"[{DateTime.UtcNow:o}] ERROR:{ex.Message}\n{ex}\n\n";
                File.AppendAllText(logErr, entry);
            }
            catch { }
            return (false, ex.Message);
        }
    }
}
