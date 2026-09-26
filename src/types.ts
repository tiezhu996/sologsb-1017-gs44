export type RevisionColor = 'white' | 'blue' | 'pink' | 'yellow' | 'green' | 'goldenrod' | 'buff' | 'salmon' | 'cherry'
export type WarningStatus = 'pending' | 'accepted' | 'ignored'
export type WarningType = 'character' | 'prop' | 'wardrobe' | 'timeline'

export interface Character {
  id: string
  name: string
  actor: string
  introducedSceneId: string
  note: string
}

export interface Prop {
  id: string
  name: string
  introducedSceneId: string
  ownerId: string
  note: string
}

export interface Wardrobe {
  id: string
  characterId: string
  name: string
  timePeriods: string[]
  note: string
}

export interface Scene {
  id: string
  number: string
  slug: string
  synopsis: string
  intExt: 'INT' | 'EXT' | 'INT/EXT'
  location: string
  dayNight: string
  storyTime: string
  pageLength: number
  characterIds: string[]
  propIds: string[]
  costumes: Record<string, string>
  revision: RevisionColor
  status: 'draft' | 'review' | 'locked'
  reason: string
}

export interface Script {
  title: string
  writer: string
  draft: string
  scenes: Scene[]
  characters: Character[]
  props: Prop[]
  wardrobes: Wardrobe[]
}

export interface WarningItem {
  id: string
  type: WarningType
  severity: 'error' | 'warning'
  sceneId: string
  subjectId: string
  subjectLabel: string
  title: string
  detail: string
  suggestion: string
}

/** 一条警告在某个时刻的完整内容快照，决定与回复都绑定到当时的快照。 */
export interface WarningFingerprint {
  type: WarningType
  sceneId: string
  sceneNumber: string
  subjectId: string
  subjectLabel: string
  title: string
  detail: string
}

/** 失效后归档保存的上一轮决定/回复，便于在卡片上交代失效时间与原因。 */
export interface ReviewArchiveEntry {
  status: WarningStatus
  decidedAt?: string
  replies: Reply[]
  fingerprint: WarningFingerprint | null
  migrated?: boolean
  invalidatedAt: string
  invalidReason: string
}

export interface Reply {
  id: string
  author: string
  text: string
  createdAt: string
}

export interface WarningReview {
  status: WarningStatus
  replies: Reply[]
  /** 本轮决定/回复所针对的警告内容；为空表示尚未产生任何人工记录。 */
  fingerprint?: WarningFingerprint | null
  decidedAt?: string
  /** 升级前留下、按警告编号认领的旧决定。 */
  migrated?: boolean
  /** 警告上次从检查结果中消失的时间，重新出现即判定为新一轮警告。 */
  disappearedAt?: string
  archive?: ReviewArchiveEntry[]
}

export interface Version {
  id: string
  name: string
  createdAt: string
  script: Script
}

export interface ContinuityState {
  script: Script
  reviews: Record<string, WarningReview>
  versions: Version[]
  updatedAt: string
}

export interface DiffItem {
  id: string
  sceneNumber: string
  field: string
  before: string
  after: string
}
