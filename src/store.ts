import { useCallback, useEffect, useRef, useState } from 'react'
import { sampleScript } from './sample'
import type {
  Character,
  ContinuityState,
  DiffItem,
  Prop,
  Reply,
  ReviewArchiveEntry,
  Scene,
  Script,
  Version,
  Wardrobe,
  WarningFingerprint,
  WarningItem,
  WarningReview,
  WarningType
} from './types'

const STORAGE_KEY = 'sologsb-1017-continuity-v1'
const clone = <T,>(value: T): T => structuredClone(value)
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function initialState(): ContinuityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ContinuityState
      if (parsed.script?.scenes?.length) {
        // 升级前留下的决定可能没有内容快照，载入时先按当前警告对一次账。
        return reconcileReviews(parsed)
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

  script.scenes.forEach((scene, index) => {
    scene.characterIds.forEach((characterId) => {
      const character = script.characters.find((item) => item.id === characterId)
      if (!character) return
      const introducedAt = sceneIndex(character.introducedSceneId)
      if (index > 0 && !charactersSeen.has(characterId) && introducedAt >= index) {
        warnings.push({
          id: `character-${scene.id}-${characterId}`,
          type: 'character',
          severity: index > 1 ? 'error' : 'warning',
          sceneId: scene.id,
          subjectId: characterId,
          subjectLabel: `角色「${character.name}」`,
          title: `${character.name}突然出现`,
          detail: `角色在场景 ${scene.number} 首次出现，但前序场景没有建立其身份、关系或到场铺垫。`,
          suggestion: `在更早场景补充提及、声音或到场动作，并把“首次建立”场景改为相应场次。`
        })
      }
      charactersSeen.add(characterId)
    })

    scene.propIds.forEach((propId) => {
      const prop = script.props.find((item) => item.id === propId)
      if (!prop) return
      const introducedAt = sceneIndex(prop.introducedSceneId)
      if (!propsSeen.has(propId) && introducedAt > index) {
        warnings.push({
          id: `prop-${scene.id}-${propId}`,
          type: 'prop',
          severity: 'error',
          sceneId: scene.id,
          subjectId: propId,
          subjectLabel: `道具「${prop.name}」`,
          title: `${prop.name}尚未提前建立`,
          detail: `道具在场景 ${scene.number} 已出现，但首次建立被标记在场景 ${script.scenes[introducedAt]?.number ?? '未知'}。`,
          suggestion: '调整首次建立场景，或在当前场景加入来源、交接动作与持有人反应。'
        })
      }
      propsSeen.add(propId)
    })

    Object.entries(scene.costumes).forEach(([characterId, wardrobeId]) => {
      const wardrobe = script.wardrobes.find((item) => item.id === wardrobeId)
      const character = script.characters.find((item) => item.id === characterId)
      if (!wardrobe || !character) return
      if (!wardrobe.timePeriods.includes(scene.dayNight)) {
        warnings.push({
          id: `wardrobe-${scene.id}-${characterId}-${wardrobeId}`,
          type: 'wardrobe',
          severity: 'warning',
          sceneId: scene.id,
          subjectId: wardrobeId,
          subjectLabel: `角色「${character.name}」的服装「${wardrobe.name}」`,
          title: `${character.name}服装与时间冲突`,
          detail: `“${wardrobe.name}”只配置用于 ${wardrobe.timePeriods.join('、')}，本场标记为“${scene.dayNight}”。`,
          suggestion: '确认是否跨越时间连续拍摄；如需延续服装，请把当前时段加入服装适用范围。'
        })
      }
    })

    if (index > 0 && script.scenes[index - 1].storyTime && scene.storyTime && index > 0) {
      const previous = script.scenes[index - 1]
      const previousDay = previous.storyTime.match(/第\s*(\d+)\s*天/)?.[1]
      const currentDay = scene.storyTime.match(/第\s*(\d+)\s*天/)?.[1]
      if (previousDay && currentDay && Number(currentDay) < Number(previousDay)) {
        warnings.push({
          id: `timeline-${scene.id}`,
          type: 'timeline',
          severity: 'error',
          sceneId: scene.id,
          subjectId: 'story-time',
          subjectLabel: '故事时间线',
          title: '时间线出现倒退',
          detail: `上一场为第 ${previousDay} 天，本场却标记为第 ${currentDay} 天，可能造成观看顺序混乱。`,
          suggestion: '调整故事时间，或明确使用倒叙并在场次摘要中标注时间跳转。'
        })
      }
    }
  })
  return warnings
}

/** 提取一条警告当前的全部内容，作为决定与回复的归属依据。 */
export function fingerprintWarning(warning: WarningItem, script: Script): WarningFingerprint {
  const scene = script.scenes.find((item) => item.id === warning.sceneId)
  return {
    type: warning.type,
    sceneId: warning.sceneId,
    sceneNumber: scene?.number ?? '',
    subjectId: warning.subjectId,
    subjectLabel: warning.subjectLabel,
    title: warning.title,
    detail: warning.detail
  }
}

const typeLabel: Record<WarningType, string> = {
  character: '人物',
  prop: '道具',
  wardrobe: '服装',
  timeline: '时间线'
}

/** 解析旧式决定键（类型-场景ID-…），用于升级前决定的认领与跨槽转移。 */
function parseWarningKey(key: string, script: Script): { type: WarningType; sceneId: string; subjectId: string } | null {
  const prefixes: Array<[WarningType, string]> = [
    ['wardrobe', 'wardrobe-'],
    ['character', 'character-'],
    ['prop', 'prop-'],
    ['timeline', 'timeline-']
  ]
  for (const [type, prefix] of prefixes) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const scene = script.scenes.find((item) => rest === item.id || rest.startsWith(`${item.id}-`))
    if (!scene) return null
    let subjectId = rest.slice(scene.id.length)
    if (subjectId.startsWith('-')) subjectId = subjectId.slice(1)
    if (type === 'timeline') subjectId = 'story-time'
    return { type, sceneId: scene.id, subjectId }
  }
  return null
}

function describeFingerprintDiff(before: WarningFingerprint, after: WarningFingerprint): string {
  const changes: string[] = []
  if (before.sceneId !== after.sceneId) changes.push('警告转移到了别的场次')
  if (before.sceneNumber !== after.sceneNumber) changes.push(`场景号由「${before.sceneNumber || '空'}」变为「${after.sceneNumber || '空'}」`)
  if (before.subjectId !== after.subjectId || before.subjectLabel !== after.subjectLabel) {
    changes.push(`涉及对象由${before.subjectLabel || typeLabel[before.type]}变为${after.subjectLabel || typeLabel[after.type]}`)
  }
  if (before.title !== after.title) changes.push(`问题标题由「${before.title}」变为「${after.title}」`)
  if (before.detail !== after.detail) changes.push('说明文字已改动')
  return changes.length ? changes.join('；') : '警告内容有改动'
}

function formatGap(start: string, end: string): string {
  const ms = Date.parse(end) - Date.parse(start)
  if (!Number.isFinite(ms) || ms < 60_000) return '一小段时间'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.round(hours / 24)
  return `${days} 天`
}

function hasMeaningfulReview(review: WarningReview | undefined): boolean {
  return !!review && (review.status !== 'pending' || review.replies.length > 0)
}

function archiveReview(review: WarningReview, reason: string, now: string): WarningReview {
  const entry: ReviewArchiveEntry = {
    status: review.status,
    decidedAt: review.decidedAt,
    replies: clone(review.replies),
    fingerprint: clone(review.fingerprint ?? null),
    migrated: review.migrated,
    invalidatedAt: now,
    invalidReason: reason
  }
  return {
    status: 'pending',
    replies: [],
    fingerprint: null,
    migrated: false,
    archive: [...(review.archive ?? []), entry]
  }
}

/**
 * 让每条决定/回复跟随当时那条警告：
 * - 警告消失后再出现：旧决定作废，回到待审；
 * - 场号、涉及角色/道具、说明文字等内容不同：旧决定作废，回到待审；
 * - 升级前无快照的决定：按警告编号（必要时按类型+场次+涉及对象）认领，认不出来的留待重新出现时回待审；
 * - 恢复旧版本后同样重新对账。
 */
export function reconcileReviews(state: ContinuityState): ContinuityState {
  const { script } = state
  const warnings = deriveWarnings(script)
  const reviews = clone(state.reviews ?? {})
  const warningById = new Map(warnings.map((warning) => [warning.id, warning]))
  let changed = false
  const now = new Date().toISOString()

  const invalidate = (key: string, reason: string) => {
    const current = reviews[key]
    if (current) {
      reviews[key] = archiveReview(current, reason, now)
      changed = true
    }
  }

  // 第一阶段：决定键对应的警告槽位已经不在（场次或涉及对象被换掉）。
  // 升级前的旧决定没有内容快照，尽量按“类型+场次+涉及对象”找到同槽位的新警告认领。
  const claimedTargets = new Set<string>()
  for (const [key, review] of Object.entries(reviews)) {
    if (warningById.has(key)) continue
    // 没有任何人工记录的空槽位不需要认领，留给第三阶段清理。
    if (!hasMeaningfulReview(review)) continue
    const parsed = parseWarningKey(key, script)
    if (!parsed) {
      if (!review.disappearedAt) {
        review.disappearedAt = now
        changed = true
      }
      continue
    }
    const candidate = warnings.find(
      (warning) =>
        warning.type === parsed.type &&
        warning.sceneId === parsed.sceneId &&
        !claimedTargets.has(warning.id) &&
        (parsed.type === 'timeline' || warning.subjectId === parsed.subjectId)
    )
    if (!candidate) {
      if (!review.disappearedAt) {
        review.disappearedAt = now
        changed = true
      }
      continue
    }
    claimedTargets.add(candidate.id)
    if (!review.fingerprint) {
      // 升级前的决定按当前槽位认领，但因为没有当时的内容快照，一律视为新警告重新审阅。
      const moved: WarningReview = archiveReview(
        review,
        `升级前留下的决定在当前剧本中找到了同类型、同场次、同涉及对象的警告（${typeLabel[candidate.type]}·场景 ${script.scenes.find((scene) => scene.id === candidate.sceneId)?.number ?? '-'}），但缺少当时的警告内容记录，无法确认内容一致，需要重新审阅。`,
        now
      )
      reviews[candidate.id] = { ...moved, disappearedAt: undefined }
    } else if (warningById.has(candidate.id) && !reviews[candidate.id]) {
      const current = fingerprintWarning(candidate, script)
      reviews[candidate.id] = { ...archiveReview(review, describeFingerprintDiff(review.fingerprint, current), now), disappearedAt: undefined }
    } else {
      if (!review.disappearedAt) {
        review.disappearedAt = now
        changed = true
      }
      continue
    }
    delete reviews[key]
    changed = true
  }

  // 第二阶段：当前存在的警告，逐一与决定所绑定的历史内容对账。
  for (const warning of warnings) {
    const review = reviews[warning.id]
    const fingerprint = fingerprintWarning(warning, script)
    if (!review) continue
    if (review.disappearedAt) {
      invalidate(
        warning.id,
        `该警告曾在 ${new Date(review.disappearedAt).toLocaleString('zh-CN')} 随作者修改消失，约 ${formatGap(review.disappearedAt, now)}后同样的问题再次出现，上次的${review.status === 'accepted' ? '接受' : '忽略'}决定不再算数。`
      )
      if (reviews[warning.id]?.disappearedAt) reviews[warning.id] = { ...reviews[warning.id], disappearedAt: undefined }
      continue
    }
    if (!review.fingerprint) {
      if (hasMeaningfulReview(review)) {
        // 升级前的决定按警告编号认领：内容快照缺失，标注“升级前认领”，审阅人可据此重新判断。
        if (!review.migrated) {
          review.migrated = true
          changed = true
        }
        review.fingerprint = fingerprint
        changed = true
      }
      continue
    }
    const previous = review.fingerprint
    const same =
      previous.type === fingerprint.type &&
      previous.sceneId === fingerprint.sceneId &&
      previous.sceneNumber === fingerprint.sceneNumber &&
      previous.subjectId === fingerprint.subjectId &&
      previous.subjectLabel === fingerprint.subjectLabel &&
      previous.title === fingerprint.title &&
      previous.detail === fingerprint.detail
    if (!same) {
      invalidate(warning.id, describeFingerprintDiff(previous, fingerprint))
    }
  }

  // 第三阶段：仍然对不上任何当前警告的决定，记录消失时间；重新出现时由第二阶段作废。
  for (const [key, review] of Object.entries(reviews)) {
    if (warningById.has(key)) continue
    if (!hasMeaningfulReview(review) && !review.archive?.length) {
      if (review.disappearedAt) {
        delete review.disappearedAt
        changed = true
      }
      continue
    }
    if (!review.disappearedAt) {
      review.disappearedAt = now
      changed = true
    }
  }

  return changed ? { ...state, reviews } : state
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
      // 剧本一改，旧决定是否还对得上当前警告要立刻重新对账，避免卡片沿用历史忽略。
      return reconcileReviews({ ...previous, script: next, updatedAt: new Date().toISOString() })
    })
  }, [])

  const undo = useCallback(() => {
    setState((previous) => {
      const target = undoRef.current.pop()
      if (!target) return previous
      redoRef.current.push(clone(previous.script))
      return reconcileReviews({ ...previous, script: target, updatedAt: new Date().toISOString() })
    })
  }, [])

  const redo = useCallback(() => {
    setState((previous) => {
      const target = redoRef.current.pop()
      if (!target) return previous
      undoRef.current.push(clone(previous.script))
      return reconcileReviews({ ...previous, script: target, updatedAt: new Date().toISOString() })
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
      const existing = previous.reviews[warningId]
      // 已失效归档后重新做出的决定，必须绑定到当前这条警告的内容。
      const warning = deriveWarnings(previous.script).find((item) => item.id === warningId)
      const fingerprint = warning ? fingerprintWarning(warning, previous.script) : existing?.fingerprint ?? null
      const next: WarningReview = {
        ...(existing ?? { replies: [] }),
        status,
        fingerprint,
        migrated: false,
        decidedAt: status === 'pending' ? undefined : new Date().toISOString(),
        archive: existing?.archive ?? []
      }
      if (status === 'pending' && !next.replies.length && !next.archive?.length) {
        const reviews = { ...previous.reviews }
        delete reviews[warningId]
        return { ...previous, reviews, updatedAt: new Date().toISOString() }
      }
      return { ...previous, reviews: { ...previous.reviews, [warningId]: next }, updatedAt: new Date().toISOString() }
    })
  }, [])

  const addReply = useCallback((warningId: string, author: string, text: string) => {
    if (!text.trim()) return
    const reply: Reply = { id: id('reply'), author, text: text.trim(), createdAt: new Date().toISOString() }
    setState((previous) => {
      const existing = previous.reviews[warningId]
      // 回复同样跟随当时的警告内容：首次回复时若尚未绑定，则锁定当前内容快照。
      const warning = deriveWarnings(previous.script).find((item) => item.id === warningId)
      const fingerprint = existing?.fingerprint ?? (warning ? fingerprintWarning(warning, previous.script) : null)
      const review: WarningReview = {
        status: existing?.status ?? 'pending',
        replies: [...(existing?.replies ?? []), reply],
        fingerprint,
        decidedAt: existing?.decidedAt,
        migrated: existing?.migrated,
        archive: existing?.archive ?? []
      }
      return { ...previous, reviews: { ...previous.reviews, [warningId]: review }, updatedAt: new Date().toISOString() }
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
