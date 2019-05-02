import { Wrapper } from '@vue/test-utils';
import { Vue } from 'vue-property-decorator';

export function mockInput(
  wrapper: Wrapper<Vue>,
  value: string = '',
  selector: string = 'input'
) {
  wrapper.find(selector).setValue(value);
}
