using Microsoft.AspNetCore.Mvc;
using Uc10.Application.Auth;

namespace Uc10.Api.Middleware;

public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _log;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task Invoke(HttpContext ctx)
    {
        try { await _next(ctx); }
        catch (InvalidCredentialsException ex)           { await Write(ctx, 401, "invalid_credentials", ex.Message); }
        catch (EmailAlreadyRegisteredException ex)       { await Write(ctx, 409, "email_taken",        ex.Message); }
        catch (EmployeeIdAlreadyInUseException ex)       { await Write(ctx, 409, "employee_id_taken", ex.Message); }
        catch (ArgumentException ex)                     { await Write(ctx, 400, "bad_request",        ex.Message); }
        catch (UnauthorizedAccessException ex)           { await Write(ctx, 403, "forbidden",          ex.Message); }
        catch (KeyNotFoundException ex)                  { await Write(ctx, 404, "not_found",          ex.Message); }
        catch (Exception ex)
        {
            _log.LogError(ex, "unhandled exception");
            await Write(ctx, 500, "internal_error", "Unexpected error. See server logs.");
        }
    }

    private static Task Write(HttpContext ctx, int status, string title, string detail)
    {
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/problem+json";
        var pd = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Type = $"https://uc10.local/problems/{title}"
        };
        return ctx.Response.WriteAsJsonAsync(pd);
    }
}
