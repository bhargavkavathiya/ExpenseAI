using System;
using Microsoft.EntityFrameworkCore;
using Uc10.Infrastructure.Persistence;
using Uc10.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

var config = new ConfigurationBuilder().AddJsonFile("src/Uc10.Api/appsettings.json").Build();
var optionsBuilder = new DbContextOptionsBuilder<Uc10DbContext>();
optionsBuilder.UseNpgsql(config.GetConnectionString("Default"));

using var db = new Uc10DbContext(optionsBuilder.Options);

var expensesTotal = await db.Expenses.CountAsync();
var pendingInQueue = await db.ReviewQueue.CountAsync(r => r.Status == ReviewStatus.Pending);
var pendingInExpenses = await db.Expenses.CountAsync(e => e.Status == ExpenseStatus.NeedsReview);

Console.WriteLine($"TOTAL EXPENSES: {expensesTotal}");
Console.WriteLine($"PENDING IN QUEUE (Enum): {pendingInQueue}");
Console.WriteLine($"PENDING IN EXPENSES (Status): {pendingInExpenses}");

var rawQueue = await db.Database.ExecuteSqlRawAsync("SELECT COUNT(*) FROM review_queue WHERE status::text = 'pending'");
Console.WriteLine($"RAW SQL PENDING (pending): {rawQueue}");

var rawQueueCap = await db.Database.ExecuteSqlRawAsync("SELECT COUNT(*) FROM review_queue WHERE status::text = 'Pending'");
Console.WriteLine($"RAW SQL PENDING (Pending): {rawQueueCap}");
