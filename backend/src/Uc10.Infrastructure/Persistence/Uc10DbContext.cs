using Microsoft.EntityFrameworkCore;
using Uc10.Domain.Entities;
using Uc10.Domain.Enums;

namespace Uc10.Infrastructure.Persistence;

public class Uc10DbContext : DbContext
{
    public Uc10DbContext(DbContextOptions<Uc10DbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<EmployeeBand> EmployeeBands => Set<EmployeeBand>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<ReceiptFile> ReceiptFiles => Set<ReceiptFile>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<AiInvocation> AiInvocations => Set<AiInvocation>();
    public DbSet<PolicyRule> PolicyRules => Set<PolicyRule>();
    public DbSet<Threshold> Thresholds => Set<Threshold>();
    public DbSet<ReviewQueueItem> ReviewQueue => Set<ReviewQueueItem>();
    public DbSet<GstinCacheEntry> GstinCache => Set<GstinCacheEntry>();
    public DbSet<DuplicateHash> DuplicateHashes => Set<DuplicateHash>();
    public DbSet<AnomalyProfile> AnomalyProfiles => Set<AnomalyProfile>();
    public DbSet<IntegrationStatus> IntegrationStatuses => Set<IntegrationStatus>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Snake-case table names match the SQL init scripts.
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Email).HasColumnName("email").IsRequired();
            e.Property(x => x.PasswordHash).HasColumnName("password_hash").IsRequired();
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => x.Email).IsUnique();

            // Employee profile fields
            e.Property(x => x.EmployeeId).HasColumnName("employee_id");
            e.Property(x => x.FullName).HasColumnName("full_name");
            e.Property(x => x.Mobile).HasColumnName("mobile");
            e.Property(x => x.Department).HasColumnName("department");
            e.Property(x => x.ManagerName).HasColumnName("manager_name");
            e.Property(x => x.Band).HasColumnName("band");
            e.Property(x => x.RegistrationSource).HasColumnName("registration_source");
            e.Property(x => x.Location).HasColumnName("location");
            e.Property(x => x.CostCenter).HasColumnName("cost_center");
        });

        b.Entity<EmployeeBand>(e =>
        {
            e.ToTable("employee_bands");
            e.HasKey(x => x.Code);
            e.Property(x => x.Code).HasColumnName("code");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.Description).HasColumnName("description");
            e.Property(x => x.RankOrder).HasColumnName("rank_order");
            e.Property(x => x.Active).HasColumnName("active");
            e.Property(x => x.Allowances).HasColumnName("allowances").HasColumnType("jsonb");
            e.Property(x => x.UpdatedBy).HasColumnName("updated_by");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        b.Entity<Role>(e =>
        {
            e.ToTable("roles");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name").IsRequired();
            e.Property(x => x.Description).HasColumnName("description");
        });

        b.Entity<UserRole>(e =>
        {
            e.ToTable("user_roles");
            e.HasKey(x => new { x.UserId, x.RoleId });
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.RoleId).HasColumnName("role_id");
            e.HasOne(x => x.Role).WithMany().HasForeignKey(x => x.RoleId);
        });

        b.Entity<Expense>(e =>
        {
            e.ToTable("expenses");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.RefId).HasColumnName("ref_id").IsRequired();
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Status).HasColumnName("status").HasColumnType("expense_status");
            e.Property(x => x.SubmittedAt).HasColumnName("submitted_at");
            e.Property(x => x.CompletedAt).HasColumnName("completed_at");
            e.Property(x => x.Result).HasColumnName("result").HasColumnType("jsonb");
            e.Property(x => x.OverallConfidence).HasColumnName("overall_confidence").HasPrecision(5, 4);
            e.Property(x => x.NeedsReview).HasColumnName("needs_review");
            e.Property(x => x.ReviewReason).HasColumnName("review_reason");
            e.Property(x => x.Category).HasColumnName("category");
            e.Property(x => x.PaymentMode).HasColumnName("payment_mode");
            e.Property(x => x.Purpose).HasColumnName("purpose");
            e.Property(x => x.City).HasColumnName("city");
            e.Property(x => x.ClaimedAmount).HasColumnName("claimed_amount").HasPrecision(18, 2);
            e.Property(x => x.ClaimedDate).HasColumnName("claimed_date");
            e.Property(x => x.ClaimedMerchant).HasColumnName("claimed_merchant");
            e.Property(x => x.ClaimedGstin).HasColumnName("claimed_gstin");
            e.Property(x => x.EmployeeName).HasColumnName("employee_name");
            e.Property(x => x.Department).HasColumnName("department");
            e.HasIndex(x => x.RefId).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Receipt).WithOne(r => r!.Expense!).HasForeignKey<ReceiptFile>(r => r.ExpenseId);
        });

        b.Entity<ReceiptFile>(e =>
        {
            e.ToTable("receipt_files");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ExpenseId).HasColumnName("expense_id");
            e.Property(x => x.ContentType).HasColumnName("content_type");
            e.Property(x => x.SizeBytes).HasColumnName("size_bytes");
            e.Property(x => x.StoragePath).HasColumnName("storage_path");
            e.Property(x => x.PHash).HasColumnName("phash");
            e.Property(x => x.UploadedAt).HasColumnName("uploaded_at");
        });

        b.Entity<AuditLog>(e =>
        {
            e.ToTable("audit_logs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Seq).HasColumnName("seq").ValueGeneratedOnAdd();
            e.Property(x => x.Ts).HasColumnName("ts");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.ExpenseId).HasColumnName("expense_id");
            e.Property(x => x.Module).HasColumnName("module");
            e.Property(x => x.ModelVersion).HasColumnName("model_version");
            e.Property(x => x.PromptVersion).HasColumnName("prompt_version");
            e.Property(x => x.InputRef).HasColumnName("input_ref");
            e.Property(x => x.OutputSnapshot).HasColumnName("output_snapshot").HasColumnType("jsonb");
            e.Property(x => x.Confidence).HasColumnName("confidence").HasPrecision(5, 4);
            e.Property(x => x.PrevHash).HasColumnName("prev_hash");
            e.Property(x => x.Hash).HasColumnName("hash");
            e.HasIndex(x => x.Seq).IsUnique();
        });

        b.Entity<AiInvocation>(e =>
        {
            e.ToTable("ai_invocations");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ExpenseId).HasColumnName("expense_id");
            e.Property(x => x.Module).HasColumnName("module");
            e.Property(x => x.ModelVersion).HasColumnName("model_version");
            e.Property(x => x.PromptVersion).HasColumnName("prompt_version");
            e.Property(x => x.InputRef).HasColumnName("input_ref");
            e.Property(x => x.Output).HasColumnName("output").HasColumnType("jsonb");
            e.Property(x => x.Confidence).HasColumnName("confidence").HasPrecision(5, 4);
            e.Property(x => x.DurationMs).HasColumnName("duration_ms");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.ErrorMessage).HasColumnName("error_message");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        b.Entity<PolicyRule>(e =>
        {
            e.ToTable("policy_rules");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Code).HasColumnName("code");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.Description).HasColumnName("description");
            e.Property(x => x.Type).HasColumnName("type").HasColumnType("policy_rule_type");
            e.Property(x => x.Params).HasColumnName("params").HasColumnType("jsonb");
            e.Property(x => x.Active).HasColumnName("active");
            e.Property(x => x.Severity).HasColumnName("severity");
            e.Property(x => x.UpdatedBy).HasColumnName("updated_by");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => x.Code).IsUnique();
        });

        b.Entity<Threshold>(e =>
        {
            e.ToTable("thresholds");
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasColumnName("key");
            e.Property(x => x.Value).HasColumnName("value").HasPrecision(18, 6);
            e.Property(x => x.Description).HasColumnName("description");
            e.Property(x => x.UpdatedBy).HasColumnName("updated_by");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        b.Entity<ReviewQueueItem>(e =>
        {
            e.ToTable("review_queue");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ExpenseId).HasColumnName("expense_id");
            e.Property(x => x.Reason).HasColumnName("reason");
            e.Property(x => x.Status).HasColumnName("status").HasColumnType("review_status");
            e.Property(x => x.AssignedTo).HasColumnName("assigned_to");
            e.Property(x => x.DecidedBy).HasColumnName("decided_by");
            e.Property(x => x.DecidedAt).HasColumnName("decided_at");
            e.Property(x => x.DecisionNote).HasColumnName("decision_note");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasOne(x => x.Expense).WithMany().HasForeignKey(x => x.ExpenseId);
            e.HasIndex(x => x.ExpenseId).IsUnique();
        });

        b.Entity<GstinCacheEntry>(e =>
        {
            e.ToTable("gstin_lookup_cache");
            e.HasKey(x => x.Gstin);
            e.Property(x => x.Gstin).HasColumnName("gstin");
            e.Property(x => x.LegalName).HasColumnName("legal_name");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.Payload).HasColumnName("payload").HasColumnType("jsonb");
            e.Property(x => x.CachedAt).HasColumnName("cached_at");
            e.Property(x => x.TtlSeconds).HasColumnName("ttl_seconds");
        });

        b.Entity<DuplicateHash>(e =>
        {
            e.ToTable("duplicate_hashes");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.ExpenseId).HasColumnName("expense_id");
            e.Property(x => x.PHash).HasColumnName("phash");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        b.Entity<AnomalyProfile>(e =>
        {
            e.ToTable("anomaly_profiles");
            e.HasKey(x => x.UserId);
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.SampleCount).HasColumnName("sample_count");
            e.Property(x => x.MeanAmount).HasColumnName("mean_amount").HasPrecision(18, 4);
            e.Property(x => x.StddevAmount).HasColumnName("stddev_amount").HasPrecision(18, 4);
            e.Property(x => x.LastAmount).HasColumnName("last_amount").HasPrecision(18, 4);
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        b.Entity<IntegrationStatus>(e =>
        {
            e.ToTable("external_integration_status");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.Health).HasColumnName("health").HasColumnType("integration_health");
            e.Property(x => x.CircuitState).HasColumnName("circuit_state").HasColumnType("circuit_state");
            e.Property(x => x.LastChecked).HasColumnName("last_checked");
            e.Property(x => x.LastError).HasColumnName("last_error");
            e.Property(x => x.ConsecutiveFailures).HasColumnName("consecutive_failures");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => x.Name).IsUnique();
        });
    }

}
