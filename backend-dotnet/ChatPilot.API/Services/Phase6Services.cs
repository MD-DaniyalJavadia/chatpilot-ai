using System.Security.Cryptography;
using System.Text.Json;
using ChatPilot.API.DTOs;
using ChatPilot.API.Interfaces;
using ChatPilot.API.Models;

namespace ChatPilot.API.Services;

public sealed class PaymentGatewayService : IPaymentGatewayService
{
    public Task<(string Provider, string ExternalTxnId, string Status, DateTime? PaidOn, string Message)> ProcessChargeAsync(
        int businessId, string planCode, string planName, string billingCycle, decimal amountUsd, string provider, CancellationToken ct = default)
    {
        var suffix = Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
        if (provider == "ManualInvoice")
        {
            var isFree = amountUsd <= 0m;
            return Task.FromResult((
                "ManualInvoice",
                $"inv_{DateTime.UtcNow:yyyyMMdd}_{suffix}",
                isFree ? "Succeeded" : "Pending",
                isFree ? (DateTime?)DateTime.UtcNow : null,
                isFree ? $"Activated {planName}" : $"Manual invoice issued for ${amountUsd:F2}."
            ));
        }

        return Task.FromResult((
            provider == "Stripe" ? "Stripe" : "SandboxCard",
            $"ch_{suffix}",
            "Succeeded",
            (DateTime?)DateTime.UtcNow,
            $"Processed ${amountUsd:F2} ({billingCycle}) for {planName}."
        ));
    }
}

public sealed class BillingService : IBillingService
{
    private readonly IPhase6Repository _repo;
    private readonly IPaymentGatewayService _gateway;
    private readonly IAuditLogRepository _audit;

    public BillingService(IPhase6Repository repo, IPaymentGatewayService gateway, IAuditLogRepository audit)
    {
        _repo = repo;
        _gateway = gateway;
        _audit = audit;
    }

    public Task<IEnumerable<SubscriptionPlanEntity>> ListPlansAsync(bool includeInactive)
        => _repo.ListPlansAsync(includeInactive);

    public async Task<int> CreatePlanAsync(CreatePlanRequestDto dto, int adminUserId, string? ip)
    {
        var id = await _repo.CreatePlanAsync(dto);
        await _audit.WriteAsync(adminUserId, null, "PlanCreated", "SubscriptionPlan", id.ToString(), $"Created {dto.Name}", ip);
        return id;
    }

    public async Task<bool> UpdatePlanAsync(int planId, UpdatePlanRequestDto dto, int adminUserId, string? ip)
    {
        var ok = await _repo.UpdatePlanAsync(planId, dto);
        if (ok)
        {
            await _audit.WriteAsync(adminUserId, null, "PlanUpdated", "SubscriptionPlan", planId.ToString(), $"Updated {dto.Name}", ip);
        }
        return ok;
    }

    public Task<object> GetBusinessBillingAsync(int businessId)
        => _repo.GetBusinessBillingSummaryAsync(businessId);

    public async Task<object> CheckoutAsync(int businessId, int userId, CheckoutSubscriptionRequestDto dto, string? ip, CancellationToken ct = default)
    {
        var plans = await _repo.ListPlansAsync(false);
        var plan = plans.FirstOrDefault(p => p.PlanId == dto.PlanId)
            ?? throw new KeyNotFoundException("Selected subscription plan is not available.");

        var cycle = string.Equals(dto.BillingCycle, "Yearly", StringComparison.OrdinalIgnoreCase) ? "Yearly" : "Monthly";
        var amount = cycle == "Yearly" ? plan.YearlyPriceUsd : plan.MonthlyPriceUsd;
        var charge = await _gateway.ProcessChargeAsync(businessId, plan.Code, plan.Name, cycle, amount, dto.Provider, ct);

        var expiresOn = DateTime.UtcNow.AddDays(cycle == "Yearly" ? 365 : 30);
        var subId = await _repo.SwitchSubscriptionPlanAsync(
            businessId, plan.PlanId, cycle, amount, charge.Provider, charge.ExternalTxnId, charge.Status, expiresOn);

        await _audit.WriteAsync(userId, businessId, "SubscriptionChanged", "Subscription", subId.ToString(),
            $"Switched to {plan.Name} ({cycle}) [{charge.Status}]", ip);

        return new
        {
            subscriptionId = subId,
            planId = plan.PlanId,
            planName = plan.Name,
            billingCycle = cycle,
            amountUsd = amount,
            paymentStatus = charge.Status,
            externalTxnId = charge.ExternalTxnId,
            expiresOn
        };
    }

    public Task<IEnumerable<SubscriptionRecordEntity>> AdminListSubscriptionsAsync(string? search, string status, int page, int pageSize)
        => _repo.AdminListSubscriptionsAsync(search, status, page, pageSize);

    public Task<IEnumerable<PaymentRecordEntity>> AdminListPaymentsAsync(string? search, string status, string provider, int page, int pageSize)
        => _repo.AdminListPaymentsAsync(search, status, provider, page, pageSize);
}

public sealed class TicketService : ITicketService
{
    private readonly IPhase6Repository _repo;
    private readonly IAuditLogRepository _audit;

    public TicketService(IPhase6Repository repo, IAuditLogRepository audit)
    {
        _repo = repo;
        _audit = audit;
    }

    public async Task<int> CreateTicketAsync(int businessId, int userId, CreateSupportTicketDto dto, string? ip)
    {
        var id = await _repo.CreateTicketAsync(businessId, userId, dto);
        await _audit.WriteAsync(userId, businessId, "SupportTicketCreated", "SupportTicket", id.ToString(), dto.Subject, ip);
        return id;
    }

    public Task<object?> GetTicketAsync(int ticketId, int? tenantBusinessId)
        => _repo.GetTicketWithMessagesAsync(ticketId, tenantBusinessId);
}

public sealed class SettingsService : ISettingsService
{
    private readonly IPhase6Repository _repo;
    private readonly IAuditLogRepository _audit;

    public SettingsService(IPhase6Repository repo, IAuditLogRepository audit)
    {
        _repo = repo;
        _audit = audit;
    }

    public Task<IEnumerable<SystemSettingEntity>> GetSystemSettingsAsync()
        => _repo.GetSystemSettingsAsync();

    public async Task<bool> UpdateAiProviderAsync(int providerId, UpdateAiProviderDto dto, int adminUserId, string? ip)
    {
        var json = JsonSerializer.Serialize(dto.Models);
        var ok = await _repo.UpdateAiProviderAsync(providerId, dto.Name.Trim(), json, dto.IsActive);
        if (ok)
        {
            await _audit.WriteAsync(adminUserId, null, "AiProviderUpdated", "AIProvider", providerId.ToString(), dto.Name, ip);
        }
        return ok;
    }
}
