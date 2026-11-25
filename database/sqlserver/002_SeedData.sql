-- ============================================================================
-- ChatPilot AI - SQL Server Seed Script (Roles & Subscription Plans)
-- File: 002_SeedData.sql
-- ============================================================================

-- Seed Roles
MERGE dbo.Roles AS target
USING (VALUES
    ('SuperAdmin',    'Manages the complete ChatPilot AI SaaS platform'),
    ('BusinessOwner', 'Owns business tenant, billing, team, and all chatbots'),
    ('BusinessAdmin', 'Manages assigned business chatbots, sources, and team staff'),
    ('BusinessStaff', 'Accesses permitted conversations and chatbot views')
) AS src(Name, Description)
ON target.Name = src.Name
WHEN NOT MATCHED THEN
    INSERT (Name, Description) VALUES (src.Name, src.Description);
GO

-- Seed Subscription Plans
MERGE dbo.SubscriptionPlans AS target
USING (VALUES
    ('FREE',         'Free',         0.00,   0.00,    1,  250,    1,  0),
    ('STARTER',      'Starter',      29.00,  290.00,  3,  5000,   3,  0),
    ('PROFESSIONAL', 'Professional', 99.00,  990.00,  15, 50000,  10, 1),
    ('ENTERPRISE',   'Enterprise',   299.00, 2990.00, 100,250000, 50, 1)
) AS src(Code, Name, MonthlyPriceUsd, YearlyPriceUsd, MaxChatbots, MaxMonthlyMessages, MaxTeamMembers, AllowWebsiteIngestion)
ON target.Code = src.Code
WHEN NOT MATCHED THEN
    INSERT (Code, Name, MonthlyPriceUsd, YearlyPriceUsd, MaxChatbots, MaxMonthlyMessages, MaxTeamMembers, AllowWebsiteIngestion)
    VALUES (src.Code, src.Name, src.MonthlyPriceUsd, src.YearlyPriceUsd, src.MaxChatbots, src.MaxMonthlyMessages, src.MaxTeamMembers, src.AllowWebsiteIngestion);
GO
