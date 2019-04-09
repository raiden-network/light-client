import { Wrapper } from '@vue/test-utils';
import { Vue } from 'vue-property-decorator';

export function mockInput(
  wrapper: Wrapper<Vue>,
  value: string = '',
  selector: string = 'input'
) {
  const input = wrapper.find(selector);
  (input.element as HTMLInputElement).value = value;
  input.trigger('input');
}
