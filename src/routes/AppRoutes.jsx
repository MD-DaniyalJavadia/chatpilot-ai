import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AdminAiProvidersPage } from '../pages/admin/AdminAiProvidersPage';
import { AdminAiUsagePage } from '../pages/admin/AdminAiUsagePage';
import { AdminChatbotsPage } from '../pages/admin/AdminChatbotsPage';
import { AdminConversationsPage } from '../pages/admin/AdminConversationsPage';
import { AdminPaymentsPage } from '../pages/admin/AdminPaymentsPage';
import { AdminPlansPage } from '../pages/admin/AdminPlansPage';
import { AdminSubscriptionsPage } from '../pages/admin/AdminSubscriptionsPage';
import { AdminSystemSettingsPage } from '../pages/admin/AdminSystemSettingsPage';
import { AdminTicketsPage } from '../pages/admin/AdminTicketsPage';
import { AuditLogsPage } from '../pages/admin/AuditLogsPage';
import { BusinessesManagementPage } from '../pages/admin/BusinessesManagementPage';
import { SuperAdminDashboardPage } from '../pages/admin/SuperAdminDashboardPage';
import { UsersManagementPage } from '../pages/admin/UsersManagementPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { AnalyticsPage } from '../pages/business/AnalyticsPage';
import { BusinessDashboardPage } from '../pages/business/BusinessDashboardPage';
import { BusinessProfilePage } from '../pages/business/BusinessProfilePage';
import { BusinessSubscriptionPage } from '../pages/business/BusinessSubscriptionPage';
import { BusinessSupportPage } from '../pages/business/BusinessSupportPage';
import { ChatbotConfigPage } from '../pages/business/ChatbotConfigPage';
import { ChatbotPlaygroundPage } from '../pages/business/ChatbotPlaygroundPage';
import { ChatbotsListPage } from '../pages/business/ChatbotsListPage';
import { ConversationsPage } from '../pages/business/ConversationsPage';
import { CreateChatbotPage } from '../pages/business/CreateChatbotPage';
import { DocumentUploadsPage } from '../pages/business/DocumentUploadsPage';
import { FaqManagementPage } from '../pages/business/FaqManagementPage';
import { KnowledgeBasePage } from '../pages/business/KnowledgeBasePage';
import { TeamMembersPage } from '../pages/business/TeamMembersPage';
import { UsageStatsPage } from '../pages/business/UsageStatsPage';
import { WebsiteSourcesPage } from '../pages/business/WebsiteSourcesPage';
import { WidgetIntegrationPage } from '../pages/business/WidgetIntegrationPage';
import { AccountSettingsPage } from '../pages/shared/AccountSettingsPage';
import { ProtectedRoute } from './ProtectedRoute';

function RootRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={user.role === 'SuperAdmin' ? '/admin/dashboard' : '/app/dashboard'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Super Admin Routes */}
      <Route element={<ProtectedRoute allowedRoles={['SuperAdmin']} />}>
        <Route path="/admin/dashboard" element={<SuperAdminDashboardPage />} />
        <Route path="/admin/users" element={<UsersManagementPage />} />
        <Route path="/admin/businesses" element={<BusinessesManagementPage />} />
        <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
        <Route path="/admin/settings" element={<AccountSettingsPage />} />

        <Route path="/admin/chatbots" element={<AdminChatbotsPage />} />
        <Route path="/admin/plans" element={<AdminPlansPage />} />
        <Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
        <Route path="/admin/payments" element={<AdminPaymentsPage />} />
        <Route path="/admin/ai-usage" element={<AdminAiUsagePage />} />
        <Route path="/admin/conversations" element={<AdminConversationsPage />} />
        <Route path="/admin/tickets" element={<AdminTicketsPage />} />
        <Route path="/admin/system-settings" element={<AdminSystemSettingsPage />} />
        <Route path="/admin/ai-providers" element={<AdminAiProvidersPage />} />
      </Route>

      {/* Business Tenant Routes */}
      <Route element={<ProtectedRoute allowedRoles={['BusinessOwner', 'BusinessAdmin', 'BusinessStaff']} />}>
        <Route path="/app/dashboard" element={<BusinessDashboardPage />} />
        <Route path="/app/settings" element={<AccountSettingsPage />} />
        <Route path="/app/chatbots" element={<ChatbotsListPage />} />
        <Route path="/app/playground" element={<ChatbotPlaygroundPage />} />
        <Route path="/app/chatbots/:id/playground" element={<ChatbotPlaygroundPage />} />

        <Route path="/app/conversations" element={<ConversationsPage />} />
      </Route>

      {/* Business Owner & Business Admin Only Routes */}
      <Route element={<ProtectedRoute allowedRoles={['BusinessOwner', 'BusinessAdmin']} />}>
        <Route path="/app/profile" element={<BusinessProfilePage />} />
        <Route path="/app/team" element={<TeamMembersPage />} />
        <Route path="/app/audit-logs" element={<AuditLogsPage />} />
        <Route path="/app/chatbots/new" element={<CreateChatbotPage />} />
        <Route path="/app/chatbots/:id/configure" element={<ChatbotConfigPage />} />
        <Route path="/app/customization" element={<ChatbotConfigPage />} />

        <Route path="/app/knowledge" element={<KnowledgeBasePage />} />
        <Route path="/app/sources/websites" element={<WebsiteSourcesPage />} />
        <Route path="/app/sources/documents" element={<DocumentUploadsPage />} />
        <Route path="/app/sources/faqs" element={<FaqManagementPage />} />
        <Route path="/app/widget" element={<WidgetIntegrationPage />} />
        <Route path="/app/analytics" element={<AnalyticsPage />} />
        <Route path="/app/usage" element={<UsageStatsPage />} />
        <Route path="/app/support" element={<BusinessSupportPage />} />
      </Route>

      {/* Business Owner Only */}
      <Route element={<ProtectedRoute allowedRoles={['BusinessOwner']} />}>
        <Route path="/app/subscription" element={<BusinessSubscriptionPage />} />
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
