let fakeFrameCallback = null;

function useFrame(callback) {
  fakeFrameCallback = callback;
}

export function useFlowFrame(runtime, callback) {
  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();
    callback(snapshot, delta);
  });
}

export function __deliverFakeFrame(delta) {
  fakeFrameCallback?.({}, delta);
}
