import { useCallback, useEffect, useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusText } from '../../components/common/StatusText';
import { chatbotService } from '../../services/chatbotService';
import { widgetService } from '../../services/widgetService';
import { extractApiError, formatDateShort } from '../../utils/formatters';
import { addDomainSchema, widgetAppearanceSchema } from '../../validations/widgetSchemas';

const PLATFORM_TABS = [
  { id: 'html', label: 'HTML' },
  { id: 'react', label: 'React / Next.js' },
  { id: 'wordpress', label: 'WordPress' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'aspnet', label: 'ASP.NET Core' },
];

export function WidgetIntegrationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBotId = Number(searchParams.get('chatbotId')) || null;

  const [chatbots, setChatbots] = useState([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState(initialBotId);
  const [botDetail, setBotDetail] = useState(null);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [platformTab, setPlatformTab] = useState(0);
  const [copiedKey, setCopiedKey] = useState('');
  const [confirmDomain, setConfirmDomain] = useState(null);
  const [deletingDomain, setDeletingDomain] = useState(false);

  const [liveMountedBotId, setLiveMountedBotId] = useState(null);

  const domainForm = useForm({
    resolver: yupResolver(addDomainSchema),
    defaultValues: { domain: '' },
  });

  const appearanceForm = useForm({
    resolver: yupResolver(widgetAppearanceSchema),
    defaultValues: {
      brandColor: '#2563EB',
      logoUrl: '',
      humanHandoverEmail: '',
      widgetPosition: 'bottom-right',
      widgetTitle: '',
      widgetSubtitle: '',
      launcherLabel: 'Chat with us',
      showCitations: true,
    },
  });

  const unmountLiveWidget = useCallback(() => {
    if (typeof window !== 'undefined' && window.ChatPilotWidget?.destroy) {
      window.ChatPilotWidget.destroy();
    }
    const existingScript = document.getElementById('chatpilot-live-tester-script');
    if (existingScript && existingScript.parentNode) {
      existingScript.parentNode.removeChild(existingScript);
    }
    const existingHost = document.getElementById('chatpilot-widget-host');
    if (existingHost && existingHost.parentNode) {
      existingHost.parentNode.removeChild(existingHost);
    }
    setLiveMountedBotId(null);
  }, []);

  useEffect(() => {
    return () => {
      unmountLiveWidget();
    };
  }, [unmountLiveWidget]);

  const loadChatbotData = useCallback(
    async (targetId) => {
      if (!targetId) return;
      setError('');
      try {
        const [detail, domainRes] = await Promise.all([
          chatbotService.getChatbot(targetId),
          widgetService.listDomains(targetId),
        ]);
        setBotDetail(detail);
        setDomains(domainRes?.items || []);
        appearanceForm.reset({
          brandColor: detail.brandColor || '#2563EB',
          logoUrl: detail.logoUrl || '',
          humanHandoverEmail: detail.humanHandoverEmail || '',
          widgetPosition: detail.widgetPosition === 'bottom-left' ? 'bottom-left' : 'bottom-right',
          widgetTitle: detail.widgetTitle || '',
          widgetSubtitle: detail.widgetSubtitle || '',
          launcherLabel: detail.launcherLabel || 'Chat with us',
          showCitations: detail.showCitations !== false,
        });
      } catch (err) {
        setError(extractApiError(err, 'Unable to load widget integration settings.'));
      }
    },
    [appearanceForm]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const listRes = await chatbotService.listChatbots({ page: 1, pageSize: 50 });
        if (!active) return;
        const bots = listRes?.items || [];
        setChatbots(bots);

        const resolvedId =
          initialBotId && bots.some((b) => b.chatbotId === initialBotId)
            ? initialBotId
            : bots[0]?.chatbotId || null;

        setSelectedChatbotId(resolvedId);
        if (resolvedId) {
          await loadChatbotData(resolvedId);
        }
      } catch (err) {
        if (active) setError(extractApiError(err, 'Unable to load chatbots.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [initialBotId, loadChatbotData]);

  const handleSelectChatbot = async (nextId) => {
    unmountLiveWidget();
    setSelectedChatbotId(nextId);
    setSearchParams({ chatbotId: String(nextId) });
    setSuccessMsg('');
    await loadChatbotData(nextId);
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-chatpilot-host';
  const publicId = botDetail?.publicId || 'cb_your_public_id';

  const baseScriptSnippet = useMemo(
    () => `<script\n  src="${originUrl}/widget.js"\n  data-chatbot-id="${publicId}"\n  async\n></script>`,
    [originUrl, publicId]
  );

  const platformSnippets = useMemo(() => {
    return {
      html: {
        description: 'Paste this script tag right before the closing </body> tag in your HTML template.',
        code: baseScriptSnippet,
      },
      react: {
        description: 'Load the widget script inside a root layout effect (or Next.js <Script strategy="afterInteractive" />).',
        code: `import { useEffect } from 'react';

export function ChatPilotEmbed() {
  useEffect(() => {
    if (document.getElementById('chatpilot-embed-script')) return;
    const script = document.createElement('script');
    script.id = 'chatpilot-embed-script';
    script.src = '${originUrl}/widget.js';
    script.setAttribute('data-chatbot-id', '${publicId}');
    script.async = true;
    document.body.appendChild(script);
    return () => {
      window.ChatPilotWidget?.destroy?.();
      script.remove();
    };
  }, []);

  return null;
}`,
      },
      wordpress: {
        description: 'Add via Appearance → Theme File Editor (footer.php before </body>) or any Header & Footer Scripts plugin.',
        code: `<!-- WordPress footer.php or WPCode Footer Snippet -->\n${baseScriptSnippet}`,
      },
      shopify: {
        description: 'In Shopify Admin → Online Store → Themes → Edit code → layout/theme.liquid, paste before </body>.',
        code: `{% comment %} ChatPilot AI Assistant Widget {% endcomment %}\n${baseScriptSnippet}`,
      },
      aspnet: {
        description: 'Paste into Views/Shared/_Layout.cshtml (MVC/Razor Pages) just before the closing </body> tag.',
        code: `@* Views/Shared/_Layout.cshtml *@\n${baseScriptSnippet}`,
      },
    };
  }, [baseScriptSnippet, originUrl, publicId]);

  const activePlatform = PLATFORM_TABS[platformTab]?.id || 'html';
  const activeGuide = platformSnippets[activePlatform];

  const handleCopy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      setError('Clipboard access was denied. Please copy the snippet manually.');
    }
  };

  const onAddDomain = async (values) => {
    if (!selectedChatbotId) return;
    setError('');
    setSuccessMsg('');
    try {
      const created = await widgetService.addDomain(selectedChatbotId, values.domain);
      setDomains((prev) => [created, ...prev]);
      domainForm.reset({ domain: '' });
      setSuccessMsg(`Added "${created.domain}" to allowed domains.`);
    } catch (err) {
      setError(extractApiError(err, 'Unable to add allowed domain.'));
    }
  };

  const handleConfirmDeleteDomain = async () => {
    if (!confirmDomain || !selectedChatbotId) return;
    setDeletingDomain(true);
    setError('');
    setSuccessMsg('');
    try {
      await widgetService.deleteDomain(selectedChatbotId, confirmDomain.allowedDomainId);
      setDomains((prev) => prev.filter((d) => d.allowedDomainId !== confirmDomain.allowedDomainId));
      setSuccessMsg(`Removed "${confirmDomain.domain}" from allowed domains.`);
      setConfirmDomain(null);
    } catch (err) {
      setError(extractApiError(err, 'Unable to remove domain.'));
      setConfirmDomain(null);
    } finally {
      setDeletingDomain(false);
    }
  };

  const onSaveAppearance = async (values) => {
    if (!selectedChatbotId) return;
    setError('');
    setSuccessMsg('');
    try {
      const updated = await widgetService.updateWidgetSettings(selectedChatbotId, {
        ...values,
        logoUrl: values.logoUrl || null,
        humanHandoverEmail: values.humanHandoverEmail || null,
        widgetTitle: values.widgetTitle || null,
        widgetSubtitle: values.widgetSubtitle || null,
        launcherLabel: values.launcherLabel || null,
      });
      setBotDetail(updated);
      setSuccessMsg('Widget appearance settings saved.');
      if (liveMountedBotId === selectedChatbotId) {
        mountLiveWidget(updated.publicId, selectedChatbotId);
      }
    } catch (err) {
      setError(extractApiError(err, 'Unable to save widget appearance settings.'));
    }
  };

  const mountLiveWidget = (botPublicId, chatbotId) => {
    unmountLiveWidget();
    const script = document.createElement('script');
    script.id = 'chatpilot-live-tester-script';
    script.src = `${originUrl}/widget.js?t=${Date.now()}`;
    script.setAttribute('data-chatbot-id', botPublicId);
    script.setAttribute('data-api-base', originUrl);
    script.async = true;
    script.onload = () => {
      setTimeout(() => {
        window.ChatPilotWidget?.open?.();
      }, 150);
    };
    document.body.appendChild(script);
    setLiveMountedBotId(chatbotId);
  };

  const handleToggleLiveWidget = () => {
    if (!botDetail) return;
    if (liveMountedBotId === botDetail.chatbotId) {
      unmountLiveWidget();
    } else {
      mountLiveWidget(botDetail.publicId, botDetail.chatbotId);
    }
  };

  const watchedBrandColor = appearanceForm.watch('brandColor') || '#2563EB';
  const watchedTitle = appearanceForm.watch('widgetTitle') || botDetail?.name || 'Chat Assistant';
  const watchedSubtitle = appearanceForm.watch('widgetSubtitle') || botDetail?.businessName || 'AI Support Assistant';
  const watchedLauncher = appearanceForm.watch('launcherLabel') || 'Chat with us';
  const watchedPosition = appearanceForm.watch('widgetPosition') || 'bottom-right';
  const watchedLogoUrl = appearanceForm.watch('logoUrl');

  if (!loading && chatbots.length === 0) {
    return (
      <Paper sx={{ p: 4, maxWidth: 680 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          No Chatbots Available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Create your first AI chatbot before generating an embeddable script snippet or configuring domain allowlists.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/app/chatbots/new')}>
          Create Chatbot
        </Button>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header & Chatbot Selector */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4">Widget Integration</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Embed your AI assistant onto external websites with Shadow DOM isolation and strict domain allowlisting.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          {chatbots.length > 0 ? (
            <TextField
              select
              size="small"
              label="Chatbot"
              value={selectedChatbotId || ''}
              onChange={(e) => handleSelectChatbot(Number(e.target.value))}
              sx={{ minWidth: 230 }}
            >
              {chatbots.map((b) => (
                <MenuItem key={b.chatbotId} value={b.chatbotId}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {botDetail ? (
            <Button
              variant={liveMountedBotId === botDetail.chatbotId ? 'outlined' : 'contained'}
              color={liveMountedBotId === botDetail.chatbotId ? 'warning' : 'primary'}
              startIcon={
                liveMountedBotId === botDetail.chatbotId ? <StopOutlinedIcon /> : <PlayArrowOutlinedIcon />
              }
              onClick={handleToggleLiveWidget}
              disabled={!botDetail.isEnabled}
            >
              {liveMountedBotId === botDetail.chatbotId ? 'Unmount Live Widget' : 'Test Live Widget'}
            </Button>
          ) : null}
        </Stack>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {successMsg ? <Alert severity="success">{successMsg}</Alert> : null}

      {botDetail && !botDetail.isEnabled ? (
        <Alert severity="warning">
          This chatbot is currently paused. Activate it in My Chatbots or Configuration before embedding on live sites.
        </Alert>
      ) : null}

      {loading ? (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Skeleton height={44} />
            <Skeleton height={160} />
          </Stack>
        </Paper>
      ) : (
        <>
          {/* Section 1: Embed Code Generator & Platform Guides */}
          <Paper sx={{ p: 3 }}>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
                mb: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <CodeOutlinedIcon color="primary" fontSize="small" />
                <Typography variant="h6">Embeddable Script Snippet</Typography>
              </Box>

              {botDetail ? (
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    Public ID:{' '}
                    <Box
                      component="span"
                      sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'text.primary' }}
                    >
                      {botDetail.publicId}
                    </Box>
                  </Typography>
                  <StatusText status={botDetail.isEnabled ? 'Active' : 'Inactive'} />
                </Stack>
              ) : null}
            </Box>

            <Tabs
              value={platformTab}
              onChange={(_, next) => setPlatformTab(next)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
            >
              {PLATFORM_TABS.map((t) => (
                <Tab key={t.id} label={t.label} />
              ))}
            </Tabs>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {activeGuide?.description}
            </Typography>

            <Box
              sx={{
                position: 'relative',
                bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#0B1120' : '#F8FAFC'),
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 2,
                pr: 12,
                overflowX: 'auto',
              }}
            >
              <Box
                component="pre"
                sx={{
                  m: 0,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                  color: 'text.primary',
                  whiteSpace: 'pre',
                }}
              >
                {activeGuide?.code}
              </Box>

              <Button
                size="small"
                variant="outlined"
                startIcon={copiedKey === activePlatform ? <CheckOutlinedIcon /> : <ContentCopyOutlinedIcon />}
                onClick={() => handleCopy(activePlatform, activeGuide?.code || '')}
                sx={{ position: 'absolute', top: 12, right: 12 }}
              >
                {copiedKey === activePlatform ? 'Copied' : 'Copy'}
              </Button>
            </Box>
          </Paper>

          {/* Section 2: Domain Allowlist + Section 3: Widget Appearance */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1.05fr 1fr' },
              gap: 3,
              alignItems: 'start',
            }}
          >
            {/* Domain Allowlist Manager */}
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                <LanguageOutlinedIcon color="primary" fontSize="small" />
                <Typography variant="h6">Allowed Domains (CORS Security)</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                Authorize external hostnames permitted to load this widget. Cross-domain requests from unlisted origins are blocked automatically with HTTP 403.
              </Typography>

              <Box
                component="form"
                onSubmit={domainForm.handleSubmit(onAddDomain)}
                noValidate
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1.5,
                  alignItems: { xs: 'stretch', sm: 'flex-start' },
                  mb: 3,
                }}
              >
                <TextField
                  size="small"
                  fullWidth
                  label="Domain or Wildcard Pattern"
                  placeholder="example.com, *.example.com, or localhost:5173"
                  {...domainForm.register('domain')}
                  error={Boolean(domainForm.formState.errors.domain)}
                  helperText={
                    domainForm.formState.errors.domain?.message ||
                    'Full URLs are automatically normalized to their hostname.'
                  }
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={domainForm.formState.isSubmitting}
                  sx={{ height: 40, flexShrink: 0 }}
                >
                  Add Domain
                </Button>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Authorized Origin</TableCell>
                      <TableCell>Added</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {domains.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ py: 4, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            No external domains allowlisted yet. Same-origin dashboard testing remains enabled.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      domains.map((item) => (
                        <TableRow key={item.allowedDomainId} hover>
                          <TableCell
                            sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem', fontWeight: 500 }}
                          >
                            {item.domain}
                          </TableCell>
                          <TableCell className="tabular-nums">{formatDateShort(item.createdOn)}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Remove domain">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label={`Remove ${item.domain}`}
                                onClick={() => setConfirmDomain(item)}
                              >
                                <DeleteOutlineOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* Widget Appearance & Branding */}
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 0.75 }}>
                Widget Appearance & Handover
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                Customize how the floating chat launcher and drawer appear on visitor websites.
              </Typography>

              {/* Compact Visual Header Preview */}
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  mb: 3,
                }}
              >
                <Box
                  sx={{
                    bgcolor: /^#[0-9a-fA-F]{6}$/.test(watchedBrandColor) ? watchedBrandColor : '#2563EB',
                    color: '#FFFFFF',
                    px: 2,
                    py: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        bgcolor: 'rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {watchedLogoUrl && /^https?:\/\/.+/.test(watchedLogoUrl) ? (
                        <Box
                          component="img"
                          src={watchedLogoUrl}
                          alt="Brand logo preview"
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        watchedTitle.trim().charAt(0).toUpperCase() || 'C'
                      )}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
                        {watchedTitle}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.9, display: 'block' }} noWrap>
                        {watchedSubtitle}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 600 }}>
                    {watchedPosition === 'bottom-left' ? 'Bottom-Left' : 'Bottom-Right'}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    bgcolor: 'background.default',
                    display: 'flex',
                    justifyContent: watchedPosition === 'bottom-left' ? 'flex-start' : 'flex-end',
                  }}
                >
                  <Box
                    sx={{
                      bgcolor: /^#[0-9a-fA-F]{6}$/.test(watchedBrandColor) ? watchedBrandColor : '#2563EB',
                      color: '#FFFFFF',
                      px: 2,
                      py: 0.75,
                      borderRadius: 99,
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    {watchedLauncher}
                  </Box>
                </Box>
              </Box>

              <Box component="form" onSubmit={appearanceForm.handleSubmit(onSaveAppearance)} noValidate>
                <Stack spacing={2}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Controller
                        name="brandColor"
                        control={appearanceForm.control}
                        render={({ field }) => (
                          <Box
                            component="input"
                            type="color"
                            aria-label="Brand color picker"
                            value={/^#[0-9a-fA-F]{6}$/.test(field.value || '') ? field.value : '#2563EB'}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            sx={{
                              width: 42,
                              height: 40,
                              p: 0.25,
                              border: 1,
                              borderColor: 'divider',
                              borderRadius: 1,
                              cursor: 'pointer',
                              bgcolor: 'transparent',
                              flexShrink: 0,
                            }}
                          />
                        )}
                      />
                      <TextField
                        size="small"
                        fullWidth
                        label="Brand Color"
                        {...appearanceForm.register('brandColor')}
                        error={Boolean(appearanceForm.formState.errors.brandColor)}
                        helperText={appearanceForm.formState.errors.brandColor?.message}
                        slotProps={{
                          input: {
                            sx: { fontFamily: "'JetBrains Mono', monospace" },
                          },
                        }}
                      />
                    </Box>

                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="Widget Position"
                      value={appearanceForm.watch('widgetPosition')}
                      {...appearanceForm.register('widgetPosition')}
                      error={Boolean(appearanceForm.formState.errors.widgetPosition)}
                      helperText={appearanceForm.formState.errors.widgetPosition?.message}
                    >
                      <MenuItem value="bottom-right">Bottom Right</MenuItem>
                      <MenuItem value="bottom-left">Bottom Left</MenuItem>
                    </TextField>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Widget Header Title"
                      placeholder={botDetail?.name || 'Chat Assistant'}
                      {...appearanceForm.register('widgetTitle')}
                      error={Boolean(appearanceForm.formState.errors.widgetTitle)}
                      helperText={appearanceForm.formState.errors.widgetTitle?.message}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="Launcher Button Label"
                      placeholder="Chat with us"
                      {...appearanceForm.register('launcherLabel')}
                      error={Boolean(appearanceForm.formState.errors.launcherLabel)}
                      helperText={appearanceForm.formState.errors.launcherLabel?.message}
                    />
                  </Box>

                  <TextField
                    size="small"
                    fullWidth
                    label="Widget Subtitle"
                    placeholder={botDetail?.businessName || 'AI Support Assistant'}
                    {...appearanceForm.register('widgetSubtitle')}
                    error={Boolean(appearanceForm.formState.errors.widgetSubtitle)}
                    helperText={appearanceForm.formState.errors.widgetSubtitle?.message}
                  />

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Brand Logo URL (Optional)"
                      placeholder="https://example.com/logo.png"
                      {...appearanceForm.register('logoUrl')}
                      error={Boolean(appearanceForm.formState.errors.logoUrl)}
                      helperText={appearanceForm.formState.errors.logoUrl?.message}
                    />
                    <TextField
                      size="small"
                      fullWidth
                      label="Human Handover Email"
                      placeholder="support@example.com"
                      {...appearanceForm.register('humanHandoverEmail')}
                      error={Boolean(appearanceForm.formState.errors.humanHandoverEmail)}
                      helperText={appearanceForm.formState.errors.humanHandoverEmail?.message}
                    />
                  </Box>

                  <Controller
                    name="showCitations"
                    control={appearanceForm.control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={
                          <Switch
                            checked={Boolean(field.value)}
                            onChange={(e) => field.onChange(e.target.checked)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              Display Knowledge Base Source Citations
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Show referenced source titles and URLs under widget replies.
                            </Typography>
                          </Box>
                        }
                      />
                    )}
                  />

                  <Divider />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => navigate(`/app/chatbots/${selectedChatbotId}/configure`)}
                    >
                      AI & Behavior Settings
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={appearanceForm.formState.isSubmitting}
                    >
                      {appearanceForm.formState.isSubmitting ? 'Saving...' : 'Save Widget Branding'}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Paper>
          </Box>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDomain)}
        title={`Remove "${confirmDomain?.domain}"?`}
        description="Requests from this origin will immediately lose cross-domain access to this chatbot's widget endpoints."
        confirmLabel="Remove Domain"
        confirmColor="error"
        loading={deletingDomain}
        onClose={() => setConfirmDomain(null)}
        onConfirm={handleConfirmDeleteDomain}
      />
    </Box>
  );
}
