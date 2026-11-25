import { useMemo, useState } from 'react';
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useThemeMode } from '../hooks/useThemeMode';
import { getRoleLabel } from '../utils/formatters';

const DRAWER_WIDTH = 260;

const SUPER_ADMIN_NAV = [
  { section: 'Platform', label: 'Dashboard', path: '/admin/dashboard', icon: DashboardOutlinedIcon },
  { section: 'Platform', label: 'User Management', path: '/admin/users', icon: GroupOutlinedIcon },
  { section: 'Platform', label: 'Business Management', path: '/admin/businesses', icon: BusinessOutlinedIcon },
  { section: 'Platform', label: 'Chatbot Management', path: '/admin/chatbots', icon: SmartToyOutlinedIcon },
  { section: 'Billing & Plans', label: 'Subscription Plans', path: '/admin/plans', icon: CreditCardOutlinedIcon },
  { section: 'Billing & Plans', label: 'Subscriptions', path: '/admin/subscriptions', icon: ReceiptLongOutlinedIcon },
  { section: 'Billing & Plans', label: 'Payments', path: '/admin/payments', icon: ReceiptLongOutlinedIcon },
  { section: 'Operations', label: 'AI Usage Monitoring', path: '/admin/ai-usage', icon: SpeedOutlinedIcon },
  { section: 'Operations', label: 'Conversation Monitoring', path: '/admin/conversations', icon: ForumOutlinedIcon },
  { section: 'Operations', label: 'Support Tickets', path: '/admin/tickets', icon: SupportAgentOutlinedIcon },
  { section: 'Operations', label: 'System Settings', path: '/admin/system-settings', icon: TuneOutlinedIcon },
  { section: 'Operations', label: 'AI Provider Config', path: '/admin/ai-providers', icon: MemoryOutlinedIcon },
  { section: 'Operations', label: 'Audit Logs', path: '/admin/audit-logs', icon: PolicyOutlinedIcon },
];

const BUSINESS_NAV = [
  { section: 'Workspace', label: 'Dashboard', path: '/app/dashboard', icon: DashboardOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin', 'BusinessStaff'] },
  { section: 'Workspace', label: 'Business Profile', path: '/app/profile', icon: BusinessOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Chatbots', label: 'My Chatbots', path: '/app/chatbots', icon: SmartToyOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin', 'BusinessStaff'] },
  { section: 'Chatbots', label: 'Create Chatbot', path: '/app/chatbots/new', icon: AddCircleOutlineOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Chatbots', label: 'AI Playground', path: '/app/playground', icon: PlayArrowOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin', 'BusinessStaff'] },
  { section: 'Chatbots', label: 'Knowledge Base', path: '/app/knowledge', icon: MenuBookOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Chatbots', label: 'Website Sources', path: '/app/sources/websites', icon: LanguageOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Chatbots', label: 'Document Uploads', path: '/app/sources/documents', icon: DescriptionOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Chatbots', label: 'FAQ Management', path: '/app/sources/faqs', icon: QuizOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Engagement', label: 'Conversations', path: '/app/conversations', icon: ForumOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin', 'BusinessStaff'] },
  { section: 'Engagement', label: 'Customization', path: '/app/customization', icon: PaletteOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Engagement', label: 'Widget Integration', path: '/app/widget', icon: CodeOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Engagement', label: 'Analytics', path: '/app/analytics', icon: BarChartOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Organization', label: 'Team Members', path: '/app/team', icon: GroupOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Organization', label: 'Subscription', path: '/app/subscription', icon: CreditCardOutlinedIcon, roles: ['BusinessOwner'] },
  { section: 'Organization', label: 'Usage Statistics', path: '/app/usage', icon: SpeedOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Organization', label: 'Support', path: '/app/support', icon: SupportAgentOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Organization', label: 'Audit Logs', path: '/app/audit-logs', icon: PolicyOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin'] },
  { section: 'Organization', label: 'Account Settings', path: '/app/settings', icon: SettingsOutlinedIcon, roles: ['BusinessOwner', 'BusinessAdmin', 'BusinessStaff'] },
];

export function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { mode, toggleMode } = useThemeMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const isSuperAdmin = user?.role === 'SuperAdmin';

  const navItems = useMemo(() => {
    if (isSuperAdmin) return SUPER_ADMIN_NAV;
    return BUSINESS_NAV.filter((item) => !item.roles || item.roles.includes(user?.role));
  }, [isSuperAdmin, user?.role]);

  const sections = useMemo(() => {
    const map = new Map();
    for (const item of navItems) {
      if (!map.has(item.section)) map.set(item.section, []);
      map.get(item.section).push(item);
    }
    return Array.from(map.entries());
  }, [navItems]);

  const currentNav = navItems.find((item) => item.path === location.pathname);
  const breadcrumbRoot = isSuperAdmin ? 'Platform Admin' : user?.businessName || 'Workspace';
  const currentTitle = currentNav?.label || 'Account Settings';

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
    navigate('/login', { replace: true });
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2.5, py: 2.25 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          ChatPilot AI
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
          {isSuperAdmin ? 'SaaS Administration' : user?.businessName || 'Business Workspace'}
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5, px: 1.25 }}>
        {sections.map(([sectionName, items]) => (
          <Box key={sectionName} sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                px: 1.5,
                py: 0.5,
                display: 'block',
                fontWeight: 600,
                fontSize: '0.7rem',
              }}
            >
              {sectionName}
            </Typography>
            <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {items.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <ListItemButton
                    key={item.path}
                    selected={active}
                    onClick={() => {
                      navigate(item.path);
                      setMobileOpen(false);
                    }}
                    sx={{
                      borderRadius: 1.5,
                      py: 0.75,
                      px: 1.5,
                      minHeight: 38,
                      '&.Mui-selected': {
                        bgcolor: mode === 'dark' ? 'rgba(59, 130, 246, 0.14)' : 'rgba(29, 78, 216, 0.08)',
                        color: 'primary.main',
                        '& .MuiListItemIcon-root': { color: 'primary.main' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32, color: 'text.secondary' }}>
                      <Icon sx={{ fontSize: 18 }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      slotProps={{
                        primary: {
                          variant: 'body2',
                          fontWeight: active ? 600 : 500,
                          noWrap: true,
                        },
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {user?.fullName}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {getRoleLabel(user?.role)}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Desktop Permanent Sidebar */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRadius: 0, borderTop: 0, borderBottom: 0, borderLeft: 0 },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRadius: 0, borderTop: 0, borderBottom: 0, borderLeft: 0 },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{
            borderRadius: 0,
            borderTop: 0,
            borderLeft: 0,
            borderRight: 0,
            bgcolor: 'background.paper',
          }}
        >
          <Toolbar sx={{ gap: 2, minHeight: 60 }}>
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' } }}
              aria-label="Open navigation menu"
            >
              <MenuIcon />
            </IconButton>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
              <Typography variant="body2" color="text.secondary" noWrap>
                {breadcrumbRoot}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                /
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {currentTitle}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                <IconButton onClick={toggleMode} size="small" aria-label="Toggle light and dark mode">
                  {mode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>

              <IconButton
                onClick={(e) => setAnchorEl(e.currentTarget)}
                size="small"
                aria-label="Open account menu"
              >
                <AccountCircleOutlinedIcon />
              </IconButton>
            </Box>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user?.fullName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
              <Divider />
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  navigate(isSuperAdmin ? '/admin/settings' : '/app/settings');
                }}
              >
                <ListItemIcon>
                  <SettingsOutlinedIcon fontSize="small" />
                </ListItemIcon>
                Account Settings
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutOutlinedIcon fontSize="small" />
                </ListItemIcon>
                Sign Out
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1440, width: '100%' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
