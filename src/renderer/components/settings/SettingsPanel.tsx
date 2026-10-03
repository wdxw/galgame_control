import { useState, useEffect } from 'react'
import { Settings, Server, Monitor, Image, Globe, Sparkles, PlugZap } from 'lucide-react'
import { Modal } from '../common/Modal'
import { useTranslation } from '../../i18n/useTranslation'
import { useUIStore } from '../../store/uiStore'
import type { AppSettings, Language, WorldQuality } from '../../../shared/types'
import { DEFAULT_SETTINGS } from '../../../shared/types'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keySet, setKeySet] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const { t } = useTranslation()
  const { setLanguage } = useUIStore()

  useEffect(() => {
    if (!open) return
    window.api.getSettings().then(setSettings).catch(() => setSettings(DEFAULT_SETTINGS))
    window.api.getAiStatus().then(status => setKeySet(status.keySet)).catch(() => setKeySet(false))
    setApiKey('')
    setTestResult(null)
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    await window.api.updateSettings(settings)
    // The key is written on its own channel and is never read back.
    await window.api.saveAiSettings({
      baseUrl: settings.aiBaseUrl,
      model: settings.aiModel,
      autoAnalyze: settings.aiAutoAnalyze,
      ...(apiKey ? { apiKey } : {})
    })
    // Also update live language in UI store
    setLanguage(settings.language)
    // Apply theme immediately
    document.body.setAttribute('data-theme', settings.theme)
    setSaving(false)
    onClose()
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      await window.api.saveAiSettings({
        baseUrl: settings.aiBaseUrl,
        model: settings.aiModel,
        ...(apiKey ? { apiKey } : {})
      })
      const result = await window.api.testAiConnection()
      setKeySet(result.encrypted || keySet || !!apiKey)
      setTestResult({ ok: result.ok, message: result.message })
    } catch (error) {
      setTestResult({ ok: false, message: (error as Error).message || t('settings.aiTestFailed') })
    } finally {
      setTesting(false)
    }
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Modal open={open} onClose={onClose} title={t('settings.title')} maxWidth="max-w-md">
      <div className="space-y-6">
        {/* Scan settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-white">{t('settings.scanning')}</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">
                {t('settings.scanDepth', { n: settings.scanDepth })}
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={settings.scanDepth}
                onChange={e => update('scanDepth', parseInt(e.target.value))}
                className="w-full accent-accent"
              />
              <p className="text-xs text-gray-600 mt-1">{t('settings.scanDepthDesc')}</p>
            </div>
          </div>
        </section>

        {/* VNDB settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-white">{t('settings.vndb')}</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">{t('settings.vndbEnable')}</p>
              <p className="text-xs text-gray-600">{t('settings.vndbDesc')}</p>
            </div>
            <button
              onClick={() => update('vndbEnabled', !settings.vndbEnabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                settings.vndbEnabled ? 'bg-accent' : 'bg-surface-100'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.vndbEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-white">{t('settings.appearance')}</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">{t('settings.theme')}</label>
              <select
                value={settings.theme}
                onChange={e => update('theme', e.target.value as AppSettings['theme'])}
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/70 px-3 py-2
                           text-sm text-white focus:outline-none focus:border-accent/60 transition-colors"
              >
                <option value="dark">{t('settings.themeDark')}</option>
                <option value="darker">{t('settings.themeDarker')}</option>
                <option value="pink">{t('settings.themePink')}</option>
                <option value="anime">{t('settings.themeAnime')}</option>
                <option value="soft-pink">{t('settings.themeSoftPink')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">{t('settings.language')}</label>
              <select
                value={settings.language}
                onChange={e => update('language', e.target.value as Language)}
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/70 px-3 py-2
                           text-sm text-white focus:outline-none focus:border-accent/60 transition-colors"
              >
                <option value="zh">{t('settings.languageZh')}</option>
                <option value="en">{t('settings.languageEn')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* Thumbnails */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Image size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-white">{t('settings.thumbnails')}</h3>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">
              {t('settings.thumbnailSize', { n: settings.thumbnailSize })}
            </label>
            <input
              type="range"
              min={200}
              max={800}
              step={50}
              value={settings.thumbnailSize}
              onChange={e => update('thumbnailSize', parseInt(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </section>

        {/* 3D world */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-white">{t('settings.world')}</h3>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">{t('settings.worldQuality')}</label>
            <select
              value={settings.worldQuality}
              onChange={e => update('worldQuality', e.target.value as WorldQuality)}
              className="w-full rounded-lg border border-surface-100/25 bg-surface-100/70 px-3 py-2
                         text-sm text-white focus:outline-none focus:border-accent/60 transition-colors"
            >
              <option value="high">{t('settings.worldQualityHigh')}</option>
              <option value="medium">{t('settings.worldQualityMedium')}</option>
              <option value="low">{t('settings.worldQualityLow')}</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">{t('settings.worldQualityDesc')}</p>
          </div>
        </section>

        {/* AI analysis */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-white">{t('settings.ai')}</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">{t('settings.aiBaseUrl')}</label>
              <input
                value={settings.aiBaseUrl}
                onChange={e => update('aiBaseUrl', e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/70 px-3 py-2
                           text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">{t('settings.aiModel')}</label>
              <input
                value={settings.aiModel}
                onChange={e => update('aiModel', e.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/70 px-3 py-2
                           text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">{t('settings.aiKey')}</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={keySet ? t('settings.aiKeyStored') : t('settings.aiKeyPlaceholder')}
                className="w-full rounded-lg border border-surface-100/25 bg-surface-100/70 px-3 py-2
                           text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-accent/60 transition-colors"
              />
              <p className="text-xs text-gray-600 mt-1">{t('settings.aiKeyDesc')}</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{t('settings.aiAuto')}</p>
                <p className="text-xs text-gray-600">{t('settings.aiAutoDesc')}</p>
              </div>
              <button
                onClick={() => update('aiAutoAnalyze', !settings.aiAutoAnalyze)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings.aiAutoAnalyze ? 'bg-accent' : 'bg-surface-100'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.aiAutoAnalyze ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <div>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-100/25
                           text-xs text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <PlugZap size={13} />{testing ? t('settings.aiTesting') : t('settings.aiTest')}
              </button>
              {testResult && (
                <p className={`text-xs mt-2 ${testResult.ok ? 'text-accent' : 'text-red-400'}`}>{testResult.message}</p>
              )}
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-surface-100/10">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-100 hover:bg-white/10 text-gray-300
                       rounded-lg text-sm transition-colors"
          >
            {t('settings.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-accent hover:bg-accent/80 text-surface-300
                       rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
