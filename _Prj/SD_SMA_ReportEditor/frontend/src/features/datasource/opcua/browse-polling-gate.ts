/**
 * OPC UA 浏览轮询门闩（034 M4 / L8）。
 * 父页 deactivated 后禁止 watch/sync 把浏览轮询重新拉起。
 */

export type BrowsePollingGateHooks = {
  /** 清空所有浏览相关 interval */
  clearAll: () => void;
  /** 门闩打开且业务允许时挂表 */
  syncWhenAllowed: () => void;
};

export type BrowsePollingGate = {
  isAllowed: () => boolean;
  pause: () => void;
  /** canPoll=false 时只开门闩，不挂表 */
  resume: (canPoll: boolean) => void;
  syncAll: () => void;
};

export function createBrowsePollingGate(hooks: BrowsePollingGateHooks): BrowsePollingGate {
  let allowed = true;
  return {
    isAllowed: () => allowed,
    pause: () => {
      allowed = false;
      hooks.clearAll();
    },
    resume: (canPoll) => {
      allowed = true;
      if (canPoll) hooks.syncWhenAllowed();
    },
    syncAll: () => {
      if (!allowed) {
        hooks.clearAll();
        return;
      }
      hooks.syncWhenAllowed();
    },
  };
}
