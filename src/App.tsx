import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material'
import {
  Add,
  Block,
  CheckCircle,
  Close,
  Storage,
  Difference,
  Keyboard,
  NavigateBefore,
  NavigateNext,
  Redo,
  Reply,
  Save,
  Search,
  Undo,
  WarningAmber
} from '@mui/icons-material'
import { diffScript, useContinuityStore } from './store'
import type { RevisionColor, Scene, WarningItem, WarningStatus } from './types'

const revisionOptions: Array<{ value: RevisionColor; label: string; color: string }> = [
  { value: 'white', label: '白纸', color: '#f7f5ee' },
  { value: 'blue', label: '蓝', color: '#7da6c9' },
  { value: 'pink', label: '粉', color: '#e7a2b2' },
  { value: 'yellow', label: '黄', color: '#ead56e' },
  { value: 'green', label: '绿', color: '#86bd91' },
  { value: 'goldenrod', label: '金菊', color: '#c99e37' },
  { value: 'buff', label: '浅黄', color: '#deb887' },
  { value: 'salmon', label: '鲑粉', color: '#e9967a' },
  { value: 'cherry', label: '樱桃', color: '#d65a64' }
]
const dayNightOptions = ['白天', '夜', '清晨', '黄昏', '傍晚']
const timePeriods = ['白天', '夜', '清晨', '黄昏', '傍晚']
const searchFields = ['slug', 'synopsis', 'location', 'storyTime', 'reason'] as const

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return <>{text}</>
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>
}

function SceneCard({ scene, query, active, onOpen }: { scene: Scene; query: string; active: boolean; onOpen: () => void }) {
  return (
    <Paper
      component="article"
      elevation={0}
      className={`outline-card ${active ? 'active' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen() }}
    >
      <Box className="scene-number">{scene.number}</Box>
      <Box className="outline-copy">
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="h6"><Highlight text={scene.slug} query={query} /></Typography>
          <Chip size="small" label={`${scene.intExt}. ${scene.location}`} />
          <Chip size="small" label={scene.dayNight} variant="outlined" />
          <Chip size="small" label={scene.status === 'locked' ? '锁定' : scene.status === 'review' ? '待审' : '草稿'} color={scene.status === 'review' ? 'warning' : 'default'} />
          <span className={`revision-dot revision-${scene.revision}`} title={`修订色：${scene.revision}`} />
        </Stack>
        <Typography className="outline-synopsis"><Highlight text={scene.synopsis || '尚未填写场景摘要。'} query={query} /></Typography>
        <Stack direction="row" gap={2} flexWrap="wrap" className="outline-meta">
          <span>{scene.storyTime}</span>
          <span>{scene.pageLength.toFixed(2)} 页</span>
          <span>{scene.characterIds.length} 个角色</span>
          <span>{scene.propIds.length} 个道具</span>
        </Stack>
      </Box>
    </Paper>
  )
}

export default function App() {
  const store = useContinuityStore()
  const { state, warnings } = store
  const [selectedSceneId, setSelectedSceneId] = useState(state.script.scenes[0]?.id ?? '')
  const [view, setView] = useState<'outline' | 'detail' | 'warnings' | 'versions'>('outline')
  const [query, setQuery] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryTab, setLibraryTab] = useState('characters')
  const [versionDialog, setVersionDialog] = useState(false)
  const [versionName, setVersionName] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [warningFilter, setWarningFilter] = useState<'all' | WarningStatus>('all')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const selectedScene = state.script.scenes.find((scene) => scene.id === selectedSceneId) ?? state.script.scenes[0]
  const pendingWarnings = warnings.filter((warning) => (state.reviews[warning.id]?.status ?? 'pending') === 'pending')
  const visibleWarnings = warnings.filter((warning) => warningFilter === 'all' || (state.reviews[warning.id]?.status ?? 'pending') === warningFilter)
  const selectedVersion = state.versions.find((version) => version.id === selectedVersionId) ?? state.versions[0]
  const diff = useMemo(() => selectedVersion ? diffScript(selectedVersion.script, state.script) : [], [selectedVersion, state.script])
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return state.script.scenes.flatMap((scene) => searchFields.flatMap((field) => {
      const value = String(scene[field] ?? '')
      return value.toLowerCase().includes(normalized) ? [{ scene, field, value }] : []
    }))
  }, [query, state.script.scenes])

  useEffect(() => {
    if (!state.script.scenes.some((scene) => scene.id === selectedSceneId)) setSelectedSceneId(state.script.scenes[0]?.id ?? '')
  }, [selectedSceneId, state.script.scenes])

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? store.redo() : store.undo()
      } else if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        store.redo()
      } else if (command && event.key === 'Enter') {
        event.preventDefault()
        setVersionDialog(true)
      } else if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
      } else if (event.key === 'Escape') {
        setQuery('')
      } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && selectedScene) {
        event.preventDefault()
        store.moveScene(selectedScene.id, event.key === 'ArrowUp' ? -1 : 1)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
        const index = state.script.scenes.findIndex((scene) => scene.id === selectedScene?.id)
        const next = index + (event.key === 'ArrowLeft' ? -1 : 1)
        if (state.script.scenes[next]) {
          setSelectedSceneId(state.script.scenes[next].id)
          setView('detail')
        }
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [selectedScene, state.script.scenes, store])

  function openScene(sceneId: string) {
    setSelectedSceneId(sceneId)
    setView('detail')
  }

  function createVersion() {
    const version = store.createVersion(versionName)
    setSelectedVersionId(version.id)
    setVersionName('')
    setVersionDialog(false)
  }

  function renderOutline() {
    return (
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" mb={2}>
          <Box>
            <Typography className="eyebrow">SCREENPLAY OVERVIEW</Typography>
            <Typography variant="h4">故事大纲</Typography>
            <Typography color="text.secondary">按当前场次顺序检查人物出场、道具建立与时间推进。</Typography>
          </Box>
          <Button variant="contained" startIcon={<Add />} onClick={() => { const sceneId = store.addScene(); setSelectedSceneId(sceneId); setView('detail') }}>新增场景</Button>
        </Stack>
        <Box className="outline-grid">
          {state.script.scenes.map((scene) => <SceneCard key={scene.id} scene={scene} query={query} active={scene.id === selectedScene?.id} onOpen={() => openScene(scene.id)} />)}
        </Box>
      </Box>
    )
  }

  function renderSceneDetail() {
    if (!selectedScene) return null
    const sceneWarnings = warnings.filter((warning) => warning.sceneId === selectedScene.id)
    const locked = selectedScene.status === 'locked'
    return (
      <Box className="detail-page">
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems={{ md: 'flex-start' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography className="eyebrow">SCENE {selectedScene.number}</Typography>
            <input
              className="scene-slug-input"
              value={selectedScene.slug}
              disabled={locked}
              aria-label="场景名"
              onChange={(event) => store.updateScene(selectedScene.id, 'slug', event.target.value)}
            />
            <Stack direction="row" gap={1} mt={1} flexWrap="wrap">
              <Chip label={`${sceneWarnings.length} 条检查`} color={sceneWarnings.length ? 'warning' : 'success'} size="small" />
              <Chip label={`${selectedScene.pageLength.toFixed(2)} 页`} size="small" variant="outlined" />
              <Chip label={selectedScene.storyTime} size="small" variant="outlined" />
              {locked && <Chip icon={<Block />} label="场景已锁定" size="small" />}
            </Stack>
          </Box>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="outlined" onClick={() => store.moveScene(selectedScene.id, -1)}>上移</Button>
            <Button variant="outlined" onClick={() => store.moveScene(selectedScene.id, 1)}>下移</Button>
            <Button color="error" onClick={() => { store.deleteScene(selectedScene.id); setView('outline') }}>删除</Button>
          </Stack>
        </Stack>

        {sceneWarnings.length > 0 && (
          <Alert severity="warning" icon={<WarningAmber />} sx={{ mt: 2 }}>
            本场有 {sceneWarnings.length} 条连续性问题：{sceneWarnings.map((warning) => warning.title).join('、')}
            <Button size="small" onClick={() => setView('warnings')}>前往审阅</Button>
          </Alert>
        )}

        <Paper className="editor-paper" elevation={0}>
          <Typography variant="h6">场次信息</Typography>
          <Box className="form-grid">
            <TextField label="场号" value={selectedScene.number} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'number', event.target.value)} />
            <TextField select label="内外景" value={selectedScene.intExt} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'intExt', event.target.value as Scene['intExt'])}>
              {['INT', 'EXT', 'INT/EXT'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
            </TextField>
            <TextField label="地点" value={selectedScene.location} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'location', event.target.value)} />
            <TextField select label="日夜" value={selectedScene.dayNight} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'dayNight', event.target.value)}>
              {dayNightOptions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
            </TextField>
            <TextField label="故事时间" value={selectedScene.storyTime} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'storyTime', event.target.value)} />
            <TextField type="number" label="页数" value={selectedScene.pageLength} disabled={locked} inputProps={{ step: 0.25, min: 0 }} onChange={(event) => store.updateScene(selectedScene.id, 'pageLength', Number(event.target.value))} />
            <TextField select label="场次状态" value={selectedScene.status} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'status', event.target.value as Scene['status'])}>
              <MenuItem value="draft">草稿</MenuItem>
              <MenuItem value="review">待审</MenuItem>
              <MenuItem value="locked">锁定</MenuItem>
            </TextField>
            <TextField select label="修订颜色" value={selectedScene.revision} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'revision', event.target.value as RevisionColor)}>
              {revisionOptions.map((option) => <MenuItem key={option.value} value={option.value}><span className={`revision-swatch revision-${option.value}`} />{option.label}</MenuItem>)}
            </TextField>
            <TextField className="span-2" multiline minRows={3} label="场景摘要" value={selectedScene.synopsis} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'synopsis', event.target.value)} />
            <TextField className="span-2" multiline minRows={2} label="修改理由 / 作者说明" value={selectedScene.reason} disabled={locked} onChange={(event) => store.updateScene(selectedScene.id, 'reason', event.target.value)} />
          </Box>
        </Paper>

        <Paper className="editor-paper" elevation={0}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box><Typography variant="h6">出场关系</Typography><Typography variant="body2" color="text.secondary">勾选本场出现的角色和道具，服装直接绑定到角色。</Typography></Box>
          </Stack>
          <Box className="relation-grid">
            <Box>
              <Typography className="section-label">角色</Typography>
              <Box className="chip-selector">
                {state.script.characters.map((character) => (
                  <Chip
                    key={character.id}
                    label={`${character.name} / ${character.actor}`}
                    color={selectedScene.characterIds.includes(character.id) ? 'primary' : 'default'}
                    variant={selectedScene.characterIds.includes(character.id) ? 'filled' : 'outlined'}
                    onClick={() => !locked && store.toggleSceneRelation(selectedScene.id, 'characterIds', character.id)}
                  />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography className="section-label">道具</Typography>
              <Box className="chip-selector">
                {state.script.props.map((prop) => (
                  <Chip
                    key={prop.id}
                    label={prop.name}
                    color={selectedScene.propIds.includes(prop.id) ? 'secondary' : 'default'}
                    variant={selectedScene.propIds.includes(prop.id) ? 'filled' : 'outlined'}
                    onClick={() => !locked && store.toggleSceneRelation(selectedScene.id, 'propIds', prop.id)}
                  />
                ))}
              </Box>
            </Box>
          </Box>
          {selectedScene.characterIds.length > 0 && (
            <Box className="costume-grid">
              {selectedScene.characterIds.map((characterId) => {
                const character = state.script.characters.find((item) => item.id === characterId)
                const options = state.script.wardrobes.filter((wardrobe) => wardrobe.characterId === characterId)
                return (
                  <TextField
                    key={characterId}
                    select
                    label={`${character?.name ?? '角色'}服装`}
                    value={selectedScene.costumes[characterId] ?? ''}
                    disabled={locked}
                    onChange={(event) => store.setCostume(selectedScene.id, characterId, event.target.value)}
                  >
                    <MenuItem value="">未指定</MenuItem>
                    {options.map((wardrobe) => <MenuItem key={wardrobe.id} value={wardrobe.id}>{wardrobe.name} · {wardrobe.timePeriods.join('/')}</MenuItem>)}
                  </TextField>
                )
              })}
            </Box>
          )}
        </Paper>
      </Box>
    )
  }

  function renderWarnings() {
    return (
      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={2}>
          <Box>
            <Typography className="eyebrow">CONTINUITY REVIEW</Typography>
            <Typography variant="h4">连续性问题</Typography>
            <Typography color="text.secondary">审阅人可接受或忽略；作者回复与修改理由保存在本机。</Typography>
          </Box>
          <ToggleButtonGroup exclusive size="small" value={warningFilter} onChange={(_, value) => value && setWarningFilter(value)}>
            <ToggleButton value="all">全部 {warnings.length}</ToggleButton>
            <ToggleButton value="pending">待审 {pendingWarnings.length}</ToggleButton>
            <ToggleButton value="accepted">已接受</ToggleButton>
            <ToggleButton value="ignored">已忽略</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack gap={1.5}>
          {visibleWarnings.map((warning) => {
            const review = state.reviews[warning.id] ?? { status: 'pending' as WarningStatus, replies: [] }
            const scene = state.script.scenes.find((item) => item.id === warning.sceneId)
            return (
              <Paper
                key={warning.id}
                className={`warning-panel status-${review.status}`}
                elevation={0}
                onFocus={() => setSelectedSceneId(warning.sceneId)}
                tabIndex={0}
              >
                <Box className="warning-panel-head">
                  <Box className={`warning-icon ${warning.severity}`}><WarningAmber /></Box>
                  <Box flex={1}>
                    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="h6">{warning.title}</Typography>
                      <Chip size="small" label={`场景 ${scene?.number ?? '-'}`} onClick={() => openScene(warning.sceneId)} />
                      <Chip size="small" variant="outlined" label={warning.type === 'character' ? '人物' : warning.type === 'prop' ? '道具' : warning.type === 'wardrobe' ? '服装' : '时间线'} />
                    </Stack>
                    <Typography mt={1}>{warning.detail}</Typography>
                    <Typography variant="body2" color="text.secondary" mt={.5}>建议：{warning.suggestion}</Typography>
                  </Box>
                  <Chip label={review.status === 'accepted' ? '已接受' : review.status === 'ignored' ? '已忽略' : '待审'} color={review.status === 'accepted' ? 'success' : review.status === 'ignored' ? 'default' : 'warning'} />
                </Box>
                <Stack direction="row" gap={1} mt={1.5} flexWrap="wrap">
                  <Button size="small" variant={review.status === 'accepted' ? 'contained' : 'outlined'} startIcon={<CheckCircle />} onClick={() => store.setReviewStatus(warning.id, 'accepted')}>接受问题</Button>
                  <Button size="small" variant={review.status === 'ignored' ? 'contained' : 'outlined'} color="inherit" startIcon={<Block />} onClick={() => store.setReviewStatus(warning.id, 'ignored')}>忽略警告</Button>
                  <Button size="small" onClick={() => openScene(warning.sceneId)}>打开场景</Button>
                </Stack>
                {review.replies.length > 0 && (
                  <Box className="reply-list">
                    {review.replies.map((reply) => (
                      <Box key={reply.id} className="reply-item">
                        <strong>{reply.author}</strong>
                        <span>{reply.text}</span>
                        <small>{new Date(reply.createdAt).toLocaleString('zh-CN')}</small>
                      </Box>
                    ))}
                  </Box>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mt={1.5}>
                  <TextField
                    fullWidth
                    multiline
                    maxRows={3}
                    placeholder="作者回复：说明修改理由或保留原设定"
                    value={replyDrafts[warning.id] ?? ''}
                    onChange={(event) => setReplyDrafts((previous) => ({ ...previous, [warning.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        store.addReply(warning.id, state.script.writer, replyDrafts[warning.id] ?? '')
                        setReplyDrafts((previous) => ({ ...previous, [warning.id]: '' }))
                      }
                    }}
                  />
                  <Button startIcon={<Reply />} variant="outlined" onClick={() => {
                    store.addReply(warning.id, state.script.writer, replyDrafts[warning.id] ?? '')
                    setReplyDrafts((previous) => ({ ...previous, [warning.id]: '' }))
                  }}>回复</Button>
                </Stack>
              </Paper>
            )
          })}
          {!visibleWarnings.length && <Alert severity="success">当前筛选下没有连续性问题。</Alert>}
        </Stack>
      </Box>
    )
  }

  function renderVersions() {
    return (
      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={2}>
          <Box>
            <Typography className="eyebrow">VERSION CONTROL</Typography>
            <Typography variant="h4">版本差异</Typography>
            <Typography color="text.secondary">冻结当前剧本，或把历史版本与当前工作稿逐字段比较。</Typography>
          </Box>
          <Button variant="contained" startIcon={<Save />} onClick={() => setVersionDialog(true)}>保存版本</Button>
        </Stack>
        <Box className="version-layout">
          <Paper className="version-list" elevation={0}>
            <Typography variant="h6">历史版本</Typography>
            <List disablePadding>
              {state.versions.map((version) => (
                <ListItemButton key={version.id} selected={version.id === selectedVersion?.id} onClick={() => setSelectedVersionId(version.id)}>
                  <Box>
                    <Typography fontWeight={700}>{version.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(version.createdAt).toLocaleString('zh-CN')}</Typography>
                  </Box>
                </ListItemButton>
              ))}
            </List>
            {!state.versions.length && <Typography color="text.secondary" mt={2}>尚无历史版本。</Typography>}
          </Paper>
          <Paper className="diff-panel" elevation={0}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h6">{selectedVersion ? `${selectedVersion.name} → 当前工作稿` : '等待选择版本'}</Typography>
                <Typography variant="body2" color="text.secondary">{diff.length} 处字段差异</Typography>
              </Box>
              {selectedVersion && <Button onClick={() => store.restoreVersion(selectedVersion.id)}>恢复此版本</Button>}
            </Stack>
            <Divider />
            <Box className="diff-list">
              {diff.map((item) => (
                <Box key={item.id} className="diff-row">
                  <Chip size="small" label={`场景 ${item.sceneNumber}`} />
                  <strong>{item.field}</strong>
                  <span className="diff-before">{item.before || '空'}</span>
                  <span className="diff-arrow">→</span>
                  <span className="diff-after">{item.after || '空'}</span>
                </Box>
              ))}
              {selectedVersion && !diff.length && <Alert severity="success">当前工作稿与该版本一致。</Alert>}
            </Box>
          </Paper>
        </Box>
      </Box>
    )
  }

  return (
    <Box className="app">
      <AppBar position="sticky" color="transparent" elevation={0} className="app-bar">
        <Toolbar className="toolbar">
          <Stack direction="row" alignItems="center" gap={1.4} className="brand">
            <Box className="brand-seal">场</Box>
            <Box>
              <Typography fontWeight={800} lineHeight={1.1}>场记台</Typography>
              <Typography variant="caption" color="text.secondary">CONTINUITY DESK</Typography>
            </Box>
          </Stack>
          <Stack direction="row" gap={1} alignItems="center" className="project-title">
            <input value={state.script.title} aria-label="剧本标题" onChange={(event) => store.updateScriptField('title', event.target.value)} />
            <span>{state.script.draft}</span>
          </Stack>
          <TextField
            inputRef={searchRef}
            className="global-search"
            placeholder="全文搜索场景、摘要、地点…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
          />
          <Stack direction="row" gap={.5}>
            <Tooltip title="撤销 ⌘Z"><IconButton onClick={store.undo}><Undo /></IconButton></Tooltip>
            <Tooltip title="重做 ⇧⌘Z"><IconButton onClick={store.redo}><Redo /></IconButton></Tooltip>
            <Tooltip title="资料库"><IconButton onClick={() => setLibraryOpen(true)}><Storage /></IconButton></Tooltip>
            <Tooltip title="键盘快捷键"><IconButton onClick={() => setShortcutOpen(true)}><Keyboard /></IconButton></Tooltip>
            <Button variant="contained" startIcon={<Save />} onClick={() => setVersionDialog(true)}>保存版本</Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box className="status-strip">
        <span>{store.saveStatus === 'saved' ? '● 已保存到本机' : '◌ 正在保存'}</span>
        <span>{state.script.scenes.length} 场 / {state.script.scenes.reduce((total, scene) => total + scene.pageLength, 0).toFixed(2)} 页</span>
        <span className={pendingWarnings.length ? 'attention' : ''}>{pendingWarnings.length} 条问题待审</span>
        <span>所有修改自动保存在浏览器本地</span>
      </Box>

      <Box className="scene-rail">
        <IconButton size="small" onClick={() => {
          const index = state.script.scenes.findIndex((scene) => scene.id === selectedScene?.id)
          if (state.script.scenes[index - 1]) setSelectedSceneId(state.script.scenes[index - 1].id)
        }}><NavigateBefore /></IconButton>
        <Stack direction="row" gap={1} className="scene-rail-list">
          {state.script.scenes.map((scene) => (
            <button key={scene.id} className={`rail-scene ${scene.id === selectedScene?.id ? 'active' : ''}`} onClick={() => openScene(scene.id)}>
              <strong>{scene.number}</strong><span>{scene.slug}</span>
            </button>
          ))}
        </Stack>
        <IconButton size="small" onClick={() => {
          const index = state.script.scenes.findIndex((scene) => scene.id === selectedScene?.id)
          if (state.script.scenes[index + 1]) setSelectedSceneId(state.script.scenes[index + 1].id)
        }}><NavigateNext /></IconButton>
      </Box>

      <Tabs value={view} onChange={(_, value) => setView(value)} variant="scrollable" className="view-tabs">
        <Tab value="outline" label="大纲视图" />
        <Tab value="detail" label="场景详情" />
        <Tab value="warnings" label={<Badge badgeContent={pendingWarnings.length} color="warning"><span className="tab-label">警告审阅</span></Badge>} />
        <Tab value="versions" label={<Badge badgeContent={state.versions.length} color="secondary"><span className="tab-label">版本差异</span></Badge>} />
      </Tabs>

      <Box component="main" className="main-content">
        {query && (
          <Paper className="search-results" elevation={0}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">搜索“{query}” · {searchResults.length} 个结果</Typography>
              <IconButton size="small" onClick={() => setQuery('')}><Close /></IconButton>
            </Stack>
            <Box className="search-result-list">
              {searchResults.map((result) => (
                <button key={`${result.scene.id}-${result.field}`} onClick={() => openScene(result.scene.id)}>
                  <strong>场景 {result.scene.number} · {result.field}</strong>
                  <span><Highlight text={result.value} query={query} /></span>
                </button>
              ))}
              {!searchResults.length && <Typography color="text.secondary">没有匹配内容。</Typography>}
            </Box>
          </Paper>
        )}
        {view === 'outline' && renderOutline()}
        {view === 'detail' && renderSceneDetail()}
        {view === 'warnings' && renderWarnings()}
        {view === 'versions' && renderVersions()}
      </Box>

      <Drawer anchor="right" open={libraryOpen} onClose={() => setLibraryOpen(false)} PaperProps={{ className: 'library-drawer' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" className="drawer-head">
          <Box><Typography variant="h5">连续性资料库</Typography><Typography variant="body2" color="text.secondary">角色、道具、服装与时间线</Typography></Box>
          <IconButton onClick={() => setLibraryOpen(false)}><Close /></IconButton>
        </Stack>
        <Tabs value={libraryTab} onChange={(_, value) => setLibraryTab(value)} variant="scrollable">
          <Tab value="characters" label="角色" />
          <Tab value="props" label="道具" />
          <Tab value="wardrobe" label="服装" />
          <Tab value="timeline" label="时间线" />
        </Tabs>
        <Box className="drawer-content">
          {libraryTab === 'characters' && (
            <Stack gap={1.5}>
              <Button startIcon={<Add />} variant="outlined" onClick={store.addCharacter}>新增角色</Button>
              {state.script.characters.map((character) => (
                <Paper className="library-card" key={character.id}>
                  <TextField label="姓名" value={character.name} onChange={(event) => store.updateCharacter(character.id, 'name', event.target.value)} />
                  <TextField label="演员" value={character.actor} onChange={(event) => store.updateCharacter(character.id, 'actor', event.target.value)} />
                  <TextField select label="首次建立场景" value={character.introducedSceneId} onChange={(event) => store.updateCharacter(character.id, 'introducedSceneId', event.target.value)}>
                    {state.script.scenes.map((scene) => <MenuItem key={scene.id} value={scene.id}>场景 {scene.number} · {scene.slug}</MenuItem>)}
                  </TextField>
                  <TextField label="创作备注" value={character.note} onChange={(event) => store.updateCharacter(character.id, 'note', event.target.value)} />
                </Paper>
              ))}
            </Stack>
          )}
          {libraryTab === 'props' && (
            <Stack gap={1.5}>
              <Button startIcon={<Add />} variant="outlined" onClick={store.addProp}>新增道具</Button>
              {state.script.props.map((prop) => (
                <Paper className="library-card" key={prop.id}>
                  <TextField label="道具" value={prop.name} onChange={(event) => store.updateProp(prop.id, 'name', event.target.value)} />
                  <TextField select label="首次建立场景" value={prop.introducedSceneId} onChange={(event) => store.updateProp(prop.id, 'introducedSceneId', event.target.value)}>
                    {state.script.scenes.map((scene) => <MenuItem key={scene.id} value={scene.id}>场景 {scene.number} · {scene.slug}</MenuItem>)}
                  </TextField>
                  <TextField select label="持有人" value={prop.ownerId} onChange={(event) => store.updateProp(prop.id, 'ownerId', event.target.value)}>
                    {state.script.characters.map((character) => <MenuItem key={character.id} value={character.id}>{character.name}</MenuItem>)}
                  </TextField>
                  <TextField label="连续性备注" value={prop.note} onChange={(event) => store.updateProp(prop.id, 'note', event.target.value)} />
                </Paper>
              ))}
            </Stack>
          )}
          {libraryTab === 'wardrobe' && (
            <Stack gap={1.5}>
              <Button startIcon={<Add />} variant="outlined" onClick={store.addWardrobe}>新增服装</Button>
              {state.script.wardrobes.map((wardrobe) => (
                <Paper className="library-card" key={wardrobe.id}>
                  <TextField label="服装" value={wardrobe.name} onChange={(event) => store.updateWardrobe(wardrobe.id, 'name', event.target.value)} />
                  <TextField select label="所属角色" value={wardrobe.characterId} onChange={(event) => store.updateWardrobe(wardrobe.id, 'characterId', event.target.value)}>
                    {state.script.characters.map((character) => <MenuItem key={character.id} value={character.id}>{character.name}</MenuItem>)}
                  </TextField>
                  <Box>
                    <Typography className="section-label">适用时段</Typography>
                    <Box className="chip-selector">
                      {timePeriods.map((period) => (
                        <Chip
                          key={period}
                          label={period}
                          color={wardrobe.timePeriods.includes(period) ? 'primary' : 'default'}
                          variant={wardrobe.timePeriods.includes(period) ? 'filled' : 'outlined'}
                          onClick={() => store.updateWardrobe(wardrobe.id, 'timePeriods', wardrobe.timePeriods.includes(period) ? wardrobe.timePeriods.filter((item) => item !== period) : [...wardrobe.timePeriods, period])}
                        />
                      ))}
                    </Box>
                  </Box>
                  <TextField label="连续性备注" value={wardrobe.note} onChange={(event) => store.updateWardrobe(wardrobe.id, 'note', event.target.value)} />
                </Paper>
              ))}
            </Stack>
          )}
          {libraryTab === 'timeline' && (
            <Stack gap={1.5}>
              {state.script.scenes.map((scene, index) => (
                <Paper className="library-card timeline-card" key={scene.id}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Box className="scene-number small">{scene.number}</Box>
                    <Typography fontWeight={750}>{scene.slug}</Typography>
                  </Stack>
                  <TextField label="故事时间" value={scene.storyTime} onChange={(event) => store.updateScene(scene.id, 'storyTime', event.target.value)} />
                  <TextField select label="日夜" value={scene.dayNight} onChange={(event) => store.updateScene(scene.id, 'dayNight', event.target.value)}>
                    {dayNightOptions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                  </TextField>
                  <Stack direction="row" gap={1}>
                    <Button disabled={index === 0} onClick={() => store.moveScene(scene.id, -1)}>前移</Button>
                    <Button disabled={index === state.script.scenes.length - 1} onClick={() => store.moveScene(scene.id, 1)}>后移</Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      </Drawer>

      <Dialog open={versionDialog} onClose={() => setVersionDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>保存剧本版本</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" mb={2}>版本会保存当前全部场景、资料库和审阅备注的快照，之后可与工作稿比较或恢复。</Typography>
          <TextField autoFocus fullWidth label="版本名称" value={versionName} onChange={(event) => setVersionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createVersion() }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setVersionDialog(false)}>取消</Button><Button variant="contained" onClick={createVersion}>保存</Button></DialogActions>
      </Dialog>

      <Dialog open={shortcutOpen} onClose={() => setShortcutOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>键盘快捷键</DialogTitle>
        <DialogContent>
          <Box className="shortcut-grid">
            <kbd>⌘/Ctrl + Z</kbd><span>撤销</span>
            <kbd>⇧⌘/Ctrl + Z</kbd><span>重做</span>
            <kbd>⌘/Ctrl + F</kbd><span>聚焦全文搜索</span>
            <kbd>⌘/Ctrl + Enter</kbd><span>保存版本</span>
            <kbd>Alt + ↑ / ↓</kbd><span>移动当前场景</span>
            <kbd>← / →</kbd><span>前后切换场景</span>
            <kbd>Esc</kbd><span>清除搜索</span>
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setShortcutOpen(false)}>关闭</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
