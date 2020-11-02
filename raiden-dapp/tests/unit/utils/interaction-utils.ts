import { Wrapper } from '@vue/test-utils';
import { Vue } from 'vue-property-decorator';

/**
 * @param wrapper
 * @param value
 * @param selector
 */
export function mockInput(wrapper: Wrapper<Vue>, value = '', selector = 'input') {
  wrapper.find(selector).setValue(value);
}
