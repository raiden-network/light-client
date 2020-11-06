import { Wrapper } from '@vue/test-utils';
import { Vue } from 'vue-property-decorator';

/**
 * @param wrapper - Vue wrapper
 * @param value - Value to set on element
 * @param selector - Selector of element
 */
export function mockInput(wrapper: Wrapper<Vue>, value = '', selector = 'input') {
  wrapper.find(selector).setValue(value);
}
