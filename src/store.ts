import { useCallback, useEffect, useRef, useState } from 'react'
import { sampleScript } from './sample'
import type { Character, ContinuityState, DiffItem, Prop, Reply, Scene, Script, Version, Wardrobe, WarningContentSnapshot, WarningItem, WarningReview, WarningStatus } from './types'

const STORAGE_KEY = 'sologsb-1017-continuity-v1'
const clone = <T,>(value: T): T => structuredClone(value)
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

// 决定与回复只认这一条内容：场景号、涉及的角色/道具、说明文字共同构成指纹。
function fingerprintOf(type: WarningItem['type'], sceneNumber: string, entities: string[], title: string, detail: string, suggestion: string): string {
  return JSON.stringify([type, sceneNumber, entities, title, detail, suggestion])
}

export function snapshotOf(warning: WarningItem): WarningContentSnapshot {
  return { sceneNumber: warning.sceneNumber, entities: [...warning.entities], title: warning.title, detail: warning.detail, suggestion: warning.suggestion }
}

export function createEmptyReview(): WarningReview {
  return { status: 'pending', replies: [], fingerprint: null, snapshot: null, decidedAt: null, missingSince: null, history: [] }
}

function normalizeReview(raw: unknown): WarningReview {
  const review = (raw ?? {}) as Partial<WarningReview>
  return {
    status: review.status === 'accepted' || review.status === 'ignored' ? review.status : 'pending',
    replies: Array.isArray(review.replies) ? review.replies : [],
    fingerprint: typeof review.fingerprint === 'string' ? review.fingerprint : null,
    snapshot: review.snapshot ?? null,
    decidedAt: typeof review.decidedAt === 'string' ? review.decidedAt : null,
    missingSince: typeof review.missingSince === 'string' ? review.missingSince : null,
    history: Array.isArray(review.history) ? review.history : []
  }
}

function contentChangeReason(previous: WarningContentSnapshot | null, warning: WarningItem): string {
  if (!previous) return '警告内容已变化'
  const parts: string[] = []
  if (previous.sceneNumber !== warning.sceneNumber) parts.push(`场景号由「${previous.sceneNumber}」变为「${warning.sceneNumber}」`)
  const before = previous.entities.join('、')
  const after = warning.entities.join('、')
  if (before !== after) parts.push(`涉及对象由「${before || '无'}」变为「${after || '无'}」`)
  const textChanges: string[] = []
  if (previous.title !== warning.title) textChanges.push('标题')
  if (previous.detail !== warning.detail) textChanges.push('详情')
  if (previous.suggestion !== warning.suggestion) textChanges.push('建议')
  if (textChanges.length) parts.push(`说明文字（${textChanges.join('、')}）已变化`)
  return parts.length ? parts.join('；') : '警告内容已变化'
}

// 内容对不上或警告消失后重现：当前决定与回复归档进历史，状态回到待审。
function invalidateReview(review: WarningReview, warning: WarningItem, invalidatedAt: string, reason: string): WarningReview {
  const history = [...review.history]
  if (review.status !== 'pending' || review.replies.length > 0) {
    history.push({ status: review.status, decidedAt: review.decidedAt, invalidatedAt, reason, snapshot: review.snapshot, replies: review.replies })
  }
  return { status: 'pending', replies: [], fingerprint: warning.fingerprint, snapshot: snapshotOf(warning), decidedAt: null, missingSince: null, history }
}

// 每次剧本变动（编辑、撤销重做、恢复版本）后，把所有决定与当前警告重新对账。
export function reconcileReviews(reviews: Record<string, WarningReview>, warnings: WarningItem[], now: string): Record<string, WarningReview> {
  const byId = new Map(warnings.map((warning) => [warning.id, warning]))
  let changed = false
  const next: Record<string, WarningReview> = {}
  Object.entries(reviews).forEach(([warningId, raw]) => {
    const review = normalizeReview(raw)
    const warning = byId.get(warningId)
    if (!warning) {
      // 警告暂时消失：记下消失时间，等它重现时再判失效；空记录直接清理。
      if (review.status === 'pending' && !review.replies.length && !review.history.length) { changed = true; return }
      next[warningId] = review.missingSince ? review : { ...review, missingSince: now }
      if (!review.missingSince) changed = true
      return
    }
    if (review.missingSince) {
      const reason = `警告曾于 ${new Date(review.missingSince).toLocaleString('zh-CN')} 消失，重新出现后需重新审阅`
      next[warningId] = invalidateReview(review, warning, now, reason)
      changed = true
      return
    }
    if (review.fingerprint == null) {
      // 升级前留下的决定：按当前内容认领。
      next[warningId] = { ...review, fingerprint: warning.fingerprint, snapshot: snapshotOf(warning) }
      changed = true
      return
    }
    if (review.fingerprint !== warning.fingerprint) {
      next[warningId] = invalidateReview(review, warning, now, contentChangeReason(review.snapshot, warning))
      changed = true
      return
    }
    next[warningId] = review
  })
  return changed ? next : reviews
}

// 旧版本地数据只有 { status, replies }：能对应到当前警告的按当时内容认领，认不出来的回待审。
function migrateState(parsed: ContinuityState): ContinuityState {
  const now = new Date().toISOString()
  const warnings = deriveWarnings(parsed.script)
  const byId = new Map(warnings.map((warning) => [warning.id, warning]))
  const legacyStamp = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now
  const reviews: Record<string, WarningReview> = {}
  Object.entries(parsed.reviews ?? {}).forEach(([warningId, raw]) => {
    if (raw && typeof raw === 'object' && 'fingerprint' in raw) {
      reviews[warningId] = normalizeReview(raw)
      return
    }
    const legacy = (raw ?? {}) as { status?: WarningStatus; replies?: Reply[] }
    const status: WarningStatus = legacy.status === 'accepted' || legacy.status === 'ignored' ? legacy.status : 'pending'
    const replies = Array.isArray(legacy.replies) ? legacy.replies : []
    if (status === 'pending' && !replies.length) return
    const warning = byId.get(warningId)
    if (warning) {
      reviews[warningId] = { status, replies, fingerprint: warning.fingerprint, snapshot: snapshotOf(warning), decidedAt: status === 'pending' ? null : legacyStamp, missingSince: null, history: [] }
    } else {
      reviews[warningId] = {
        ...createEmptyReview(),
        missingSince: now,
        history: [{ status, decidedAt: status === 'pending' ? null : legacyStamp, invalidatedAt: now, reason: '升级前留下的决定无法与当前警告内容对账，已回到待审', snapshot: null, replies }]
      }
    }
  })
  return { script: parsed.script, versions: Array.isArray(parsed.versions) ? parsed.versions : [], reviews, updatedAt: legacyStamp }
}

function initialState(): ContinuityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ContinuityState
      if (parsed.script?.scenes?.length) {
        const migrated = migrateState(parsed)
        return { ...migrated, reviews: reconcileReviews(migrated.reviews, deriveWarnings(migrated.script), new Date().toISOString()) }
      }
    }
  } catch {
    // Ignore an invalid local draft and restore the bundled example.
  }
  return { script: clone(sampleScript), reviews: {}, versions: [], updatedAt: new Date().toISOString() }
}

export function deriveWarnings(script: Script): WarningItem[] {
  const warnings: WarningItem[] = []
  const sceneIndex = (sceneId: string) => script.scenes.findIndex((scene) => scene.id === sceneId)
  const charactersSeen = new Set<string>()
  const propsSeen = new Set<string>()
  const stamp = (warning: Pick<WarningItem, 'id' | 'type' | 'severity' | 'sceneId' | 'title' | 'detail' | 'suggestion'>, scene: Scene, entities: string[]) => {
    warnings.push({ ...warning, sceneNumber: scene.number, entities, fingerprint: fingerprintOf(warning.type, scene.number, entities, warning.title, warning.detail, warning.suggestion) })
  }

  script.scenes.forEach((scene, index) => {
    scene.characterIds.forEach((characterId) => {
      const character = script.characters.find((item) => item.id === characterId)
      if (!character) return
      const introducedAt = sceneIndex(character.introducedSceneId)
      if (index > 0 && !charactersSeen.has(characterId) && introducedAt >= index) {
        stamp({
          id: `character-${scene.id}-${characterId}`,
          type: 'character',
          severity: index > 1 ? 'error' : 'warning',
          sceneId: scene.id,
          title: `${character.name}突然出现`,
          detail: `角色在场景 ${scene.number} 首次出现，但前序场景没有建立其身份、关系或到场铺垫。`,
          suggestion: `在更早场景补充提及、声音或到场动作，并把“首次建立”场景改为相应场次。`
        }, scene, [character.name])
      }
      charactersSeen.add(characterId)
    })

    scene.propIds.forEach((propId) => {
      const prop = script.props.find((item) => item.id === propId)
      if (!prop) return
      const introducedAt = sceneIndex(prop.introducedSceneId)
      if (!propsSeen.has(propId) && introducedAt > index) {
        stamp({
          id: `prop-${scene.id}-${propId}`,
          type: 'prop',
          severity: 'error',
          sceneId: scene.id,
          title: `${prop.name}尚未提前建立`,
          detail: `道具在场景 ${scene.number} 已出现，但首次建立被标记在场景 ${script.scenes[introducedAt]?.number ?? '未知'}。`,
          suggestion: '调整首次建立场景，或在当前场景加入来源、交接动作与持有人反应。'
        }, scene, [prop.name])
      }
      propsSeen.add(propId)
    })

    Object.entries(scene.costumes).forEach(([characterId, wardrobeId]) => {
      const wardrobe = script.wardrobes.find((item) => item.id === wardrobeId)
      const character = script.characters.find((item) => item.id === characterId)
      if (!wardrobe || !character) return
      if (!wardrobe.timePeriods.includes(scene.dayNight)) {
        stamp({
          id: `wardrobe-${scene.id}-${characterId}-${wardrobeId}`,
          type: 'wardrobe',
          severity: 'warning',
          sceneId: scene.id,
          title: `${character.name}服装与时间冲突`,
          detail: `“${wardrobe.name}”只配置用于 ${wardrobe.timePeriods.join('、')}，本场标记为“${scene.dayNight}”。`,
          suggestion: '确认是否跨越时间连续拍摄；如需延续服装，请把当前时段加入服装适用范围。'
        }, scene, [character.name, wardrobe.name])
      }
    })

    if (index > 0 && script.scenes[index - 1].storyTime && scene.storyTime && index > 0) {
      const previous = script.scenes[index - 1]
      const previousDay = previous.storyTime.match(/第\s*(\d+)\s*天/)?.[1]
      const currentDay = scene.storyTime.match(/第\s*(\d+)\s*天/)?.[1]
      if (previousDay && currentDay && Number(currentDay) < Number(previousDay)) {
        stamp({
          id: `timeline-${scene.id}`,
          type: 'timeline',
          severity: 'error',
          sceneId: scene.id,
          title: '时间线出现倒退',
          detail: `上一场为第 ${previousDay} 天，本场却标记为第 ${currentDay} 天，可能造成观看顺序混乱。`,
          suggestion: '调整故事时间，或明确使用倒叙并在场次摘要中标注时间跳转。'
        }, scene, [])
      }
    }
  })
  return warnings
}

export function diffScript(base: Script, current: Script): DiffItem[] {
  const fields: Array<{ key: keyof Scene; label: string }> = [
    { key: 'slug', label: '场名' },
    { key: 'synopsis', label: '摘要' },
    { key: 'intExt', label: '内外景' },
    { key: 'location', label: '地点' },
    { key: 'dayNight', label: '日夜' },
    { key: 'storyTime', label: '故事时间' },
    { key: 'pageLength', label: '页数' },
    { key: 'revision', label: '修订色' },
    { key: 'status', label: '状态' },
    { key: 'reason', label: '修改理由' }
  ]
  const result: DiffItem[] = []
  const sceneKey = (scene: Scene) => `${scene.number}|${scene.slug}`
  const baseByKey = new Map(base.scenes.map((scene) => [sceneKey(scene), scene]))
  current.scenes.forEach((scene) => {
    const previous = baseByKey.get(sceneKey(scene)) ?? base.scenes.find((item) => item.id === scene.id)
    if (!previous) {
      result.push({ id: `new-${scene.id}`, sceneNumber: scene.number, field: '场次', before: '不存在', after: `${scene.intExt}. ${scene.location} — ${scene.dayNight}` })
      return
    }
    fields.forEach(({ key, label }) => {
      const before = String(previous[key] ?? '')
      const after = String(scene[key] ?? '')
      if (before !== after) result.push({ id: `${scene.id}-${String(key)}`, sceneNumber: scene.number, field: label, before, after })
    })
  })
  base.scenes.forEach((scene) => {
    if (!current.scenes.some((item) => item.id === scene.id || sceneKey(item) === sceneKey(scene))) {
      result.push({ id: `deleted-${scene.id}`, sceneNumber: scene.number, field: '场次', before: `${scene.intExt}. ${scene.location} — ${scene.dayNight}`, after: '已删除' })
    }
  })
  return result
}

export function useContinuityStore() {
  const [state, setState] = useState<ContinuityState>(initialState)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const undoRef = useRef<Script[]>([])
  const redoRef = useRef<Script[]>([])
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setSaveStatus('saving')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      setSaveStatus('saved')
    }, 160)
    return () => window.clearTimeout(saveTimer.current)
  }, [state])

  const mutate = useCallback((mutator: (script: Script) => void) => {
    setState((previous) => {
      const next = clone(previous.script)
      mutator(next)
      undoRef.current.push(clone(previous.script))
      if (undoRef.current.length > 80) undoRef.current.shift()
      redoRef.current = []
      const now = new Date().toISOString()
      return { ...previous, script: next, reviews: reconcileReviews(previous.reviews, deriveWarnings(next), now), updatedAt: now }
    })
  }, [])

  const undo = useCallback(() => {
    setState((previous) => {
      const target = undoRef.current.pop()
      if (!target) return previous
      redoRef.current.push(clone(previous.script))
      const now = new Date().toISOString()
      return { ...previous, script: target, reviews: reconcileReviews(previous.reviews, deriveWarnings(target), now), updatedAt: now }
    })
  }, [])

  const redo = useCallback(() => {
    setState((previous) => {
      const target = redoRef.current.pop()
      if (!target) return previous
      undoRef.current.push(clone(previous.script))
      const now = new Date().toISOString()
      return { ...previous, script: target, reviews: reconcileReviews(previous.reviews, deriveWarnings(target), now), updatedAt: now }
    })
  }, [])

  const updateScriptField = useCallback((field: 'title' | 'writer' | 'draft', value: string) => {
    mutate((script) => { script[field] = value })
  }, [mutate])

  const updateScene = useCallback((sceneId: string, field: keyof Scene, value: Scene[keyof Scene]) => {
    mutate((script) => {
      const scene = script.scenes.find((item) => item.id === sceneId)
      if (scene) (scene as unknown as Record<string, unknown>)[field] = value
    })
  }, [mutate])

  const toggleSceneRelation = useCallback((sceneId: string, field: 'characterIds' | 'propIds', itemId: string) => {
    mutate((script) => {
      const scene = script.scenes.find((item) => item.id === sceneId)
      if (!scene) return
      const values = scene[field]
      scene[field] = values.includes(itemId) ? values.filter((value) => value !== itemId) : [...values, itemId]
    })
  }, [mutate])

  const setCostume = useCallback((sceneId: string, characterId: string, wardrobeId: string) => {
    mutate((script) => {
      const scene = script.scenes.find((item) => item.id === sceneId)
      if (!scene) return
      if (!wardrobeId) delete scene.costumes[characterId]
      else scene.costumes[characterId] = wardrobeId
    })
  }, [mutate])

  const moveScene = useCallback((sceneId: string, direction: -1 | 1) => {
    mutate((script) => {
      const index = script.scenes.findIndex((scene) => scene.id === sceneId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= script.scenes.length) return
      const [scene] = script.scenes.splice(index, 1)
      script.scenes.splice(target, 0, scene)
    })
  }, [mutate])

  const addScene = useCallback(() => {
    const sceneId = id('scene')
    mutate((script) => {
      const number = String(script.scenes.length + 1)
      script.scenes.push({
        id: sceneId, number, slug: '未命名场景', synopsis: '', intExt: 'INT', location: '待填写', dayNight: '白天', storyTime: `第 1 天`, pageLength: 1,
        characterIds: [], propIds: [], costumes: {}, revision: 'white', status: 'draft', reason: ''
      })
    })
    return sceneId
  }, [mutate])

  const deleteScene = useCallback((sceneId: string) => {
    if (state.script.scenes.length <= 1) return
    mutate((script) => { script.scenes = script.scenes.filter((scene) => scene.id !== sceneId) })
  }, [mutate, state.script.scenes.length])

  const addCharacter = useCallback(() => {
    mutate((script) => {
      script.characters.push({ id: id('char'), name: '新角色', actor: '待定', introducedSceneId: script.scenes[0]?.id ?? '', note: '' })
    })
  }, [mutate])

  const updateCharacter = useCallback((characterId: string, field: keyof Character, value: string) => {
    mutate((script) => {
      const item = script.characters.find((character) => character.id === characterId)
      if (item) item[field] = value
    })
  }, [mutate])

  const addProp = useCallback(() => {
    mutate((script) => {
      script.props.push({ id: id('prop'), name: '新道具', introducedSceneId: script.scenes[0]?.id ?? '', ownerId: script.characters[0]?.id ?? '', note: '' })
    })
  }, [mutate])

  const updateProp = useCallback((propId: string, field: keyof Prop, value: string) => {
    mutate((script) => {
      const item = script.props.find((prop) => prop.id === propId)
      if (item) item[field] = value
    })
  }, [mutate])

  const addWardrobe = useCallback(() => {
    mutate((script) => {
      script.wardrobes.push({ id: id('ward'), characterId: script.characters[0]?.id ?? '', name: '新服装', timePeriods: ['白天'], note: '' })
    })
  }, [mutate])

  const updateWardrobe = useCallback((wardrobeId: string, field: keyof Wardrobe, value: string | string[]) => {
    mutate((script) => {
      const item = script.wardrobes.find((wardrobe) => wardrobe.id === wardrobeId)
      if (item) {
        if (field === 'timePeriods') item.timePeriods = value as string[]
        else item[field] = value as never
      }
    })
  }, [mutate])

  const setReviewStatus = useCallback((warningId: string, status: WarningReview['status']) => {
    setState((previous) => {
      const now = new Date().toISOString()
      const warning = deriveWarnings(previous.script).find((item) => item.id === warningId)
      const base = previous.reviews[warningId] ? normalizeReview(previous.reviews[warningId]) : createEmptyReview()
      const next: WarningReview = {
        ...base,
        status,
        decidedAt: now,
        fingerprint: warning ? warning.fingerprint : base.fingerprint,
        snapshot: warning ? snapshotOf(warning) : base.snapshot,
        missingSince: warning ? null : base.missingSince
      }
      return { ...previous, reviews: { ...previous.reviews, [warningId]: next }, updatedAt: now }
    })
  }, [])

  const addReply = useCallback((warningId: string, author: string, text: string) => {
    if (!text.trim()) return
    const reply: Reply = { id: id('reply'), author, text: text.trim(), createdAt: new Date().toISOString() }
    setState((previous) => {
      const warning = deriveWarnings(previous.script).find((item) => item.id === warningId)
      const base = previous.reviews[warningId] ? normalizeReview(previous.reviews[warningId]) : createEmptyReview()
      const next: WarningReview = {
        ...base,
        replies: [...base.replies, reply],
        fingerprint: warning ? warning.fingerprint : base.fingerprint,
        snapshot: warning ? snapshotOf(warning) : base.snapshot,
        missingSince: warning ? null : base.missingSince
      }
      return { ...previous, reviews: { ...previous.reviews, [warningId]: next }, updatedAt: new Date().toISOString() }
    })
  }, [])

  const createVersion = useCallback((name: string) => {
    const version: Version = { id: id('version'), name: name.trim() || `版本 ${state.versions.length + 1}`, createdAt: new Date().toISOString(), script: clone(state.script) }
    setState((previous) => ({ ...previous, versions: [version, ...previous.versions] }))
    return version
  }, [state.script, state.versions.length])

  const restoreVersion = useCallback((versionId: string) => {
    const version = state.versions.find((item) => item.id === versionId)
    if (!version) return
    mutate((script) => { Object.assign(script, clone(version.script)) })
  }, [mutate, state.versions])

  const reset = useCallback(() => {
    mutate((script) => { Object.assign(script, clone(sampleScript)) })
    setState((previous) => ({ ...previous, reviews: {} }))
  }, [mutate])

  return {
    state,
    saveStatus,
    warnings: deriveWarnings(state.script),
    updateScriptField,
    updateScene,
    toggleSceneRelation,
    setCostume,
    moveScene,
    addScene,
    deleteScene,
    addCharacter,
    updateCharacter,
    addProp,
    updateProp,
    addWardrobe,
    updateWardrobe,
    setReviewStatus,
    addReply,
    createVersion,
    restoreVersion,
    undo,
    redo,
    reset
  }
}
