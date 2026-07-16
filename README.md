# Sonic Canvas

面向艺术设计学生的“平面视觉与声音映射”桌面网页原型。用户可以在 SVG 画布中绘制和组织视觉元素，并将声音标量或频谱序列映射到元素、构成、路径及移动影响层属性。

## 技术栈

- React
- TypeScript
- Vite
- SVG
- Web Audio API

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 当前原型能力

- 圆、矩形和直线绘制
- 单选、多选、框选、成组与解组
- 水平、垂直、网格、环形、沿路径、随机等构成
- 透视、组内实例和稳定成员顺序
- 标量与频谱序列映射卡
- 移动影响层与路径辅助信息
- Strudel 风格代码区、声音监控和 Web Audio 实时驱动
- 纯净视图

当前声音执行层为 Web Audio 驱动的交互原型，后续可接入正式 Strudel runtime。
