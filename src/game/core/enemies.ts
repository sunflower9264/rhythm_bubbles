import type { RandomSource } from './level';
import type { EnemyId, EnemyMechanic } from './types';

export interface EnemyArchetype {
  id: EnemyId;
  name: string;
  texture: string;
  mechanic: EnemyMechanic;
  cooldownMs: number;
  windupMs: number;
}

export const ENEMY_ARCHETYPES: readonly EnemyArchetype[] = [
  { id: 'jelly', name: '紫莓果冻', texture: 'jelly-enemy', mechanic: 'sequence', cooldownMs: 5600, windupMs: 1700 },
  { id: 'angler', name: '灯笼骗骗鱼', texture: 'angler-enemy', mechanic: 'capture', cooldownMs: 5000, windupMs: 1250 },
  { id: 'hermit', name: '铠潮寄居蟹', texture: 'hermit-enemy', mechanic: 'shell', cooldownMs: 4700, windupMs: 1500 },
  { id: 'manta', name: '星翼魔鬼鱼', texture: 'manta-enemy', mechanic: 'sweep', cooldownMs: 4400, windupMs: 1050 },
  { id: 'puffer', name: '泡泡刺豚', texture: 'puffer-enemy', mechanic: 'guard', cooldownMs: 4100, windupMs: 900 },
] as const;

export const BATTLE_STATS = [
  { maxHp: 150, attack: 10, speed: 1, boss: false },
  { maxHp: 240, attack: 11, speed: 0.88, boss: false },
  { maxHp: 380, attack: 14, speed: 0.78, boss: false },
  { maxHp: 600, attack: 17, speed: 0.7, boss: false },
  { maxHp: 950, attack: 20, speed: 0.64, boss: true },
] as const;

export function createEnemyOrder(random: RandomSource): EnemyId[] {
  const order = ENEMY_ARCHETYPES.map(({ id }) => id);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

export function getEnemyArchetype(id: EnemyId): EnemyArchetype {
  return ENEMY_ARCHETYPES.find((enemy) => enemy.id === id) ?? ENEMY_ARCHETYPES[0];
}
