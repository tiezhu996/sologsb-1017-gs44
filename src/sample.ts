import type { Script } from './types'

export const sampleScript: Script = {
  title: '潮汐之后',
  writer: '林简',
  draft: '第六稿 · 2026-09-24',
  characters: [
    { id: 'char-lin', name: '林默', actor: '程野', introducedSceneId: 'scene-1', note: '退役潜水员，怕深水。' },
    { id: 'char-su', name: '苏遥', actor: '顾清', introducedSceneId: 'scene-1', note: '地方记者，随身录音笔。' },
    { id: 'char-qiao', name: '乔叔', actor: '王海', introducedSceneId: 'scene-4', note: '灯塔看守人，关键目击者。' },
    { id: 'char-zhou', name: '周岚', actor: '许宁', introducedSceneId: 'scene-2', note: '只在电话录音中出现。' }
  ],
  props: [
    { id: 'prop-recorder', name: '银色录音笔', introducedSceneId: 'scene-1', ownerId: 'char-su', note: '屏幕有一道裂纹。' },
    { id: 'prop-ticket', name: '旧船票', introducedSceneId: 'scene-3', ownerId: 'char-lin', note: '日期被海水泡花。' },
    { id: 'prop-key', name: '灯塔铜钥匙', introducedSceneId: 'scene-4', ownerId: 'char-qiao', note: '系着褪色红绳。' }
  ],
  wardrobes: [
    { id: 'ward-lin-jacket', characterId: 'char-lin', name: '深灰防水夹克', timePeriods: ['夜', '清晨'], note: '左袖有白色反光条。' },
    { id: 'ward-lin-shirt', characterId: 'char-lin', name: '浅色旧衬衫', timePeriods: ['白天'], note: '第二颗纽扣缺失。' },
    { id: 'ward-su-coat', characterId: 'char-su', name: '卡其风衣', timePeriods: ['夜', '清晨', '白天'], note: '右肩背录音包。' },
    { id: 'ward-qiao-raincoat', characterId: 'char-qiao', name: '橙色雨衣', timePeriods: ['夜', '清晨'], note: '用于防雨，不用于晴天。' }
  ],
  scenes: [
    {
      id: 'scene-1', number: '1', slug: '堤岸·雨夜', synopsis: '林默准备卖掉旧船，苏遥带着一盘匿名录音出现。', intExt: 'EXT', location: '旧渔港堤岸', dayNight: '夜', storyTime: '第 1 天 22:40', pageLength: 2.25,
      characterIds: ['char-lin', 'char-su'], propIds: ['prop-recorder'], costumes: { 'char-lin': 'ward-lin-jacket', 'char-su': 'ward-su-coat' }, revision: 'white', status: 'review', reason: '加强苏遥主动接近林默的动机。'
    },
    {
      id: 'scene-2', number: '2', slug: '维修铺·录音', synopsis: '录音里出现林默失踪兄长的声音，画面切入回忆。', intExt: 'INT', location: '船舶维修铺', dayNight: '夜', storyTime: '第 1 天 23:20', pageLength: 1.5,
      characterIds: ['char-lin', 'char-su', 'char-zhou'], propIds: ['prop-recorder', 'prop-ticket'], costumes: { 'char-lin': 'ward-lin-jacket', 'char-su': 'ward-su-coat' }, revision: 'blue', status: 'draft', reason: '将录音身份从陌生人改为兄长。'
    },
    {
      id: 'scene-3', number: '3', slug: '售票厅·白日', synopsis: '两人核对船票，发现日期与海难发生日不吻合。', intExt: 'INT', location: '废弃售票厅', dayNight: '白天', storyTime: '第 2 天 10:10', pageLength: 2.75,
      characterIds: ['char-lin', 'char-su'], propIds: ['prop-ticket', 'prop-recorder'], costumes: { 'char-lin': 'ward-lin-jacket', 'char-su': 'ward-su-coat' }, revision: 'pink', status: 'draft', reason: '合并原第 3、4 场，避免重复解释。'
    },
    {
      id: 'scene-4', number: '4', slug: '灯塔·黎明', synopsis: '乔叔交出铜钥匙，苏遥确认录音经过剪辑。', intExt: 'EXT', location: '北岬灯塔', dayNight: '清晨', storyTime: '第 2 天 05:30', pageLength: 3.5,
      characterIds: ['char-lin', 'char-su', 'char-qiao'], propIds: ['prop-key', 'prop-recorder'], costumes: { 'char-lin': 'ward-lin-shirt', 'char-su': 'ward-su-coat', 'char-qiao': 'ward-qiao-raincoat' }, revision: 'yellow', status: 'review', reason: '呈现人物做最终决定的动作，而非对白解释。'
    }
  ]
}
