import { Wrapper } from '@vue/test-utils';
import AddressInput from '@/components/AddressInput.vue';

export function mockInput(
  wrapper: Wrapper<AddressInput>,
  value: string = '',
  selector: string = 'input'
) {
  const input = wrapper.find(selector);
  (input.element as HTMLInputElement).value = value;
  input.trigger('input');
}
