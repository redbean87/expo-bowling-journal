// Test double for '@react-native-async-storage/async-storage' used by the
// local-first profile reads test: queue storage loads at module import but
// no reads or writes happen during a render; every call fails loudly so an
// accidental storage touch cannot pass silently.
const reject = () =>
  Promise.reject(new Error('Async storage touched in a render test'));

export default {
  getItem: reject,
  setItem: reject,
  removeItem: reject,
  multiGet: reject,
  multiRemove: reject,
  clear: reject,
  mergeItem: reject,
};
