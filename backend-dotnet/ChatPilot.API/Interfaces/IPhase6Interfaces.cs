using ChatPilot.API.DTOs;
using ChatPilot.API.Models;

namespace ChatPilot.API.Interfaces;

public interface IPaymentGatewayService
{
    Task<(string Provider, string ExternalTxnId, string Status, DateTime? PaidOn, string Message)> ProcessChargeAsync(
        int businessId, string planCode, string planName, string billingCycle, decimal amountUsd, string provider, CancellationToken ct = default);
}

public interface IPhase6Repository
{
    Task<IEnumerable<SubscriptionPlanEntity>> ListPlansAsync(bool includeInactive);
    Task<int> CreatePlanAsync(CreatePlanRequestDto dto);
    Task<bool> UpdatePlanAsync(int planId, UpdatePlanRequestDto dto);
    Task<bool> SetPlanStatusAsync(int planId, bool isActive);
    Task<object> GetBusinessBillingSummaryAsync(int businessId);
    Task<int> SwitchSubscriptionPlanAsync(int businessId, int planId, string billingCycle, decimal amountUsd, string provider, string externalTxnId, string paymentStatus, DateTime expiresOn);
    Task<IEnumerable<SubscriptionRecordEntity>> AdminListSubscriptionsAsync(string? search, string status, int page, int pageSize);
    Task<IEnumerable<PaymentRecordEntity>> AdminListPaymentsAsync(string? search, string status, string provider, int page, int pageSize);
    Task<int> CreateTicketAsync(int businessId, int userId, CreateSupportTicketDto dto);
    Task<object?> GetTicketWithMessagesAsync(int ticketId, int? tenantBusinessId);
    Task<IEnumerable<SystemSettingEntity>> GetSystemSettingsAsync();
    Task<bool> UpdateAiProviderAsync(int providerId, string name, string modelsJson, bool isActive);
}

public interface IBillingService
{
    Task<IEnumerable<SubscriptionPlanEntity>> ListPlansAsync(bool includeInactive);
    Task<int> CreatePlanAsync(CreatePlanRequestDto dto, int adminUserId, string? ip);
    Task<bool> UpdatePlanAsync(int planId, UpdatePlanRequestDto dto, int adminUserId, string? ip);
    Task<object> GetBusinessBillingAsync(int businessId);
    Task<object> CheckoutAsync(int businessId, int userId, CheckoutSubscriptionRequestDto dto, string? ip, CancellationToken ct = default);
    Task<IEnumerable<SubscriptionRecordEntity>> AdminListSubscriptionsAsync(string? search, string status, int page, int pageSize);
    Task<IEnumerable<PaymentRecordEntity>> AdminListPaymentsAsync(string? search, string status, string provider, int page, int pageSize);
}

public interface ITicketService
{
    Task<int> CreateTicketAsync(int businessId, int userId, CreateSupportTicketDto dto, string? ip);
    Task<object?> GetTicketAsync(int ticketId, int? tenantBusinessId);
}

public interface ISettingsService
{
    Task<IEnumerable<SystemSettingEntity>> GetSystemSettingsAsync();
    Task<bool> UpdateAiProviderAsync(int providerId, UpdateAiProviderDto dto, int adminUserId, string? ip);
}
