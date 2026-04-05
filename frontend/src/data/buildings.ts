import type { Building } from '../types'

export const buildings: Building[] = [
  {
    id: 'forbidden-city',
    name: '故宫太和殿',
    dynasty: '明清',
    location: '北京市东城区',
    coordinates: [116.3974, 39.9163],
    description:
      '太和殿俗称"金銮殿"，是明清两代皇帝举行重大典礼的场所。面阔十一间，进深五间，建筑面积2377㎡，重檐庑殿顶，是现存最大的木构建筑之一。',
    modelPath: '/models/bonsai.splat', // 占位，替换为真实古建模型
    coverImage: null,
    type: 'public',
    status: 'ready',
  },
  {
    id: 'chengde-puning',
    name: '承德普宁寺大乘之阁',
    dynasty: '清',
    location: '河北省承德市',
    coordinates: [117.9333, 40.9963],
    description:
      '大乘之阁建于清乾隆年间，仿西藏桑耶寺建造，六层木结构楼阁，内供世界最大木雕佛像——千手千眼观音菩萨，高22.28米，被列入世界文化遗产。',
    modelPath: '/models/wumen.splat', // 占位，替换为真实古建模型
    coverImage: null,
    type: 'public',
    status: 'ready',
  },
  {
    id: 'tulou-fujian',
    name: '福建永定土楼',
    dynasty: '明清',
    location: '福建省龙岩市',
    coordinates: [116.9386, 24.6478],
    description:
      '客家土楼是客家人聚族而居的大型夯土民居建筑群，圆形或方形，最大直径达73米，可容纳800余人，被联合国教科文组织列为世界文化遗产。',
    modelPath: null,
    coverImage: null,
    type: 'public',
    status: 'pending',
  },
]

export const getBuildingById = (id: string): Building | undefined =>
  buildings.find((b) => b.id === id)
