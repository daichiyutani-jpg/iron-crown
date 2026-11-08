// 体メッシュ生成を別スレッドで行う（スマホでも UI を止めない）
import { buildBody, type BodyParams } from './anatomy';
import { meshBody } from './mesher';

self.onmessage = (ev: MessageEvent<{ id: number; params: BodyParams; h: number }>) => {
  const { id, params, h } = ev.data;
  const body = buildBody(params);
  const m = meshBody(body, h * (params.heightCm / 175));
  (self as unknown as Worker).postMessage({ id, mesh: m, scale: params.heightCm / 175 }, [m.positions.buffer, m.normals.buffer, m.rest.buffer, m.ao.buffer, m.index.buffer]);
};
