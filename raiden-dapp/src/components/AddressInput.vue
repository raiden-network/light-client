<template>
  <fieldset class="address-input">
    <v-text-field
      id="address-input"
      ref="address"
      v-model="address"
      :error-messages="errorMessages"
      :rules="isAddressValid"
      :hide-details="hideErrorLabel"
      :class="{
        'address-input--invalid': !valid && touched,
        'address-input--untouched': !touched
      }"
      :placeholder="$t('address-input.input.placeholder')"
      persistent-hint
      @blur="$emit('blur')"
      @focus="$emit('focus')"
      @input="valueChanged"
      @change="valueChanged"
    >
      <template #prepend-inner>
        <div
          v-if="value && isChecksumAddress(value)"
          class="address-input__availability"
          :class="{
            'address-input__availability--online': isAddressAvailable,
            'address-input__availability--offline': !isAddressAvailable
          }"
        >
          <img
            :src="$blockie(value)"
            :alt="$t('address-input.blockie-alt')"
            class="address-input__blockie"
          />
        </div>
      </template>
      <template #append>
        <span v-if="!busy" class="address-input__qr-code">
          <qr-code
            @click.native="isQrCodeOverlayVisible = !isQrCodeOverlayVisible"
          />
        </span>
        <div v-else>
          <spinner :size="22" :width="2" :inline="true" />
        </div>
      </template>
    </v-text-field>
    <qr-code-overlay
      :visible="isQrCodeOverlayVisible"
      @cancel="isQrCodeOverlayVisible = false"
      @decode="onDecode"
    />
  </fieldset>
</template>

<script lang="ts">
import { Component, Emit, Mixins, Prop, Watch } from 'vue-property-decorator';
import { mapState } from 'vuex';

import QrCode from '@/components/icons/QrCode.vue';
import QrCodeOverlay from '@/components/overlays/QrCodeOverlay.vue';
import Spinner from '@/components/icons/Spinner.vue';
import { Presences } from '@/model/types';
import AddressUtils from '@/utils/address-utils';
import BlockieMixin from '@/mixins/blockie-mixin';
import {
  BehaviorSubject,
  defer,
  from,
  merge,
  Observable,
  of,
  partition,
  Subscription
} from 'rxjs';
import {
  catchError,
  debounceTime,
  map,
  switchMap,
  tap
} from 'rxjs/internal/operators';

type ValidationResult = {
  error?: string;
  value: string;
  isAddress?: boolean;
};

@Component({
  components: { QrCode, QrCodeOverlay, Spinner },
  computed: { ...mapState(['presences']) }
})
export default class AddressInput extends Mixins(BlockieMixin) {
  private valueChange = new BehaviorSubject<string | undefined>('');
  private subscription?: Subscription;

  @Prop({ required: false, default: false, type: Boolean })
  hideErrorLabel!: boolean;
  @Prop()
  disabled!: boolean;
  @Prop({ required: true })
  value!: string;

  @Prop({
    default: function() {
      return [''];
    }
  })
  exclude!: Array<string>;

  @Prop({
    default: function() {
      return [''];
    }
  })
  block!: Array<string>;

  @Emit()
  inputError(errorMessage: string) {
    return errorMessage;
  }

  @Watch('errorMessages', { immediate: true })
  updateError() {
    this.inputError(this.errorMessages[0]);
  }

  address: string = '';

  typing: boolean = false;
  valid: boolean = false;
  touched: boolean = false;
  errorMessages: string[] = [];
  busy: boolean = false;
  presences!: Presences;
  isAddressAvailable: boolean = false;
  isQrCodeOverlayVisible: boolean = false;

  get isAddressValid() {
    // v-text-field interprets strings returned from a validation rule
    // as the input being invalid. Since the :rules prop does not support
    // async rules we have to workaround with a reactive prop
    const isAddressValid =
      this.address !== '' &&
      !this.busy &&
      !this.typing &&
      this.errorMessages.length === 0 &&
      this.isAddressAvailable;

    if (isAddressValid) {
      this.input(this.address);
    }

    return [() => isAddressValid || ''];
  }

  private checkAvailability(
    value: ValidationResult
  ): Observable<ValidationResult> {
    return 'error' in value
      ? of(value)
      : of(value).pipe(
          tap(() => (this.busy = true)),
          switchMap(value =>
            value.value in this.presences
              ? of(this.presences[value.value])
              : defer(() => from(this.$raiden.getAvailability(value.value)))
          ),
          map(available => {
            this.busy = false;
            this.isAddressAvailable = available;
            if (!available) {
              return {
                ...value,
                error: this.$t('address-input.error.target-offline') as string,
                isAddress: true
              };
            }
            return value;
          })
        );
  }

  private lookupEnsDomain(value: string): Observable<ValidationResult> {
    return !AddressUtils.isDomain(value)
      ? of({
          error: this.$t('address-input.error.invalid-address') as string,
          value
        })
      : of(value).pipe(
          tap(() => (this.busy = true)),
          switchMap(value => this.$raiden.ensResolve(value)),
          map(resolvedAddress => {
            if (
              !resolvedAddress ||
              !AddressUtils.checkAddressChecksum(resolvedAddress)
            ) {
              return {
                error: this.$t(
                  'address-input.error.ens-resolve-failed'
                ) as string,
                value: resolvedAddress
              };
            }
            return { value: resolvedAddress, originalValue: value };
          }),
          catchError(() =>
            of({
              error: this.$t(
                'address-input.error.ens-resolve-failed'
              ) as string,
              value
            })
          ),
          tap(() => (this.busy = false))
        );
  }

  private validateAddress(value: string): Observable<ValidationResult> {
    return defer(() => {
      let message: string | undefined = undefined;

      if (!AddressUtils.checkAddressChecksum(value)) {
        message = this.$t('address-input.error.no-checksum') as string;
      } else if (this.exclude.includes(value)) {
        message = this.$t(
          'address-input.error.invalid-excluded-address'
        ) as string;
      } else if (this.block.includes(value)) {
        message = this.$t('address-input.error.channel-not-open') as string;
      }

      if (message) {
        return of({ error: message, value, isAddress: true });
      }
      return of({ value });
    });
  }

  created() {
    this.subscription = this.valueChange
      .pipe(
        tap(() => {
          this.errorMessages = [];
          this.typing = true;
        }),
        debounceTime(600),
        switchMap(value => {
          if (!value) {
            if (this.touched) {
              return of<ValidationResult>({
                error: '',
                value: '',
              });
            }

            return of<ValidationResult>({
              error: '',
              value: ''
            });
          }

          this.touched = true;
          const [addresses, nonAddresses] = partition(of(value), value =>
            AddressUtils.isAddress(value)
          );
          return merge<ValidationResult>(
            addresses.pipe(switchMap(value => this.validateAddress(value))),
            nonAddresses.pipe(switchMap(value => this.lookupEnsDomain(value)))
          ).pipe(switchMap(value => this.checkAvailability(value)));
        })
      )
      .subscribe(({ error, value }) => {
        this.typing = false;

        if (error) {
          this.errorMessages.push(error);
        } else {
          this.address = value;
        }
        this.input(value);
        this.checkForErrors();
      });
  }

  /* istanbul ignore file */
  destroyed() {
    this.subscription?.unsubscribe();
  }

  mounted() {
    if (this.isChecksumAddress(this.value)) {
      this.address = this.value;
      this.valueChanged(this.value);
    }
  }

  @Watch('presences')
  onPresenceUpdate() {
    if (
      !this.address ||
      !this.value ||
      this.presences[this.address] === this.isAddressAvailable
    ) {
      return;
    }
    this.valueChanged(this.value);
  }

  @Watch('value')
  onChange(value: string) {
    if (
      value !== this.address &&
      (this.isChecksumAddress(value) || AddressUtils.isDomain(value))
    ) {
      this.address = value;
      this.valueChanged(this.value);
    }
  }

  @Emit()
  public input(_value?: string) {}

  valueChanged(value?: string) {
    this.valueChange.next(value);
  }

  isChecksumAddress(address: string): boolean {
    const tokenAddress = address;
    return (
      AddressUtils.isAddress(tokenAddress) &&
      AddressUtils.checkAddressChecksum(tokenAddress)
    );
  }

  private checkForErrors() {
    /* istanbul ignore if */
    if (!this.$refs.address) {
      return;
    }

    this.valid = this.errorMessages.length === 0;
    if (!this.valid) {
      return;
    }

    setTimeout(() => {
      // @ts-ignore
      this.$refs.address.validate();
    });
  }

  onDecode(decoded: string) {
    this.address = decoded;
    this.valueChanged(decoded);
    this.isQrCodeOverlayVisible = false;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/mixins';
@import '../scss/colors';
@import '../scss/fonts';

.address-input {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;

  &__blockie {
    border-radius: 50%;
    box-sizing: border-box;
    height: 22px;
    width: 22px;
    border: 1px solid #979797;
    background-color: $color-gray;
  }

  &__availability {
    margin-right: 10px;
    height: 26px;
    width: 26px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 100%;

    &--online {
      box-shadow: 0 0 0 2px greenyellow;
    }

    &--offline {
      box-shadow: 0 0 0 2px gray;
    }
  }

  @include respond-to(handhelds) {
    padding-top: 30px;
    padding-bottom: 30px;
    border: 0;
  }

  ::v-deep {
    input {
      color: $color-white;
      caret-color: $color-white !important;
      font-family: $main-font;
      font-size: 16px;
      max-height: 49px;

      &:focus {
        outline: 0;
      }
    }

    .v-input {
      &__slot {
        border-radius: 10px;
        background-color: $input-background;
        padding: 8px 8px 8px 16px;
        border: 1.5px solid transparent;
        max-height: 49px;
      }

      &--is-focused {
        .v-input {
          &__slot {
            border: 1.5px solid $primary-color;
          }
        }
      }
    }

    .v-text-field {
      &__details {
        padding-top: 8px;
      }

      > .v-input {
        &__control {
          > .v-input {
            &__slot {
              &::before,
              &::after {
                border-width: 0 0 0 0;
              }
            }
          }
        }
      }
    }

    .v-messages {
      font-family: $main-font;
      font-size: 14px;
      line-height: 16px;
      text-align: left;
      border: 1px solid transparent;

      &__wrapper {
        color: $color-white;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding-left: 20px;
        justify-content: center;

        @include respond-to(handhelds) {
          padding-left: 10px;
        }
      }

      &__message {
        color: $secondary-text-color;
        line-height: 1.1;
      }
    }
  }

  &--invalid {
    ::v-deep {
      .v-messages {
        border: none !important;

        &:after {
          content: ' ';
          position: absolute;
          left: 50%;
          bottom: 90%;
          display: inline-block;
          padding: 3px;
        }
      }
    }
  }

  &--hint-visible {
    ::v-deep {
      .v-text-field {
        &__details {
          padding-top: 0;
          margin-top: 0;
        }
      }
    }
  }

  &--untouched {
    caret-color: white !important;
    color: white !important;
  }

  &__qr-code {
    width: 20px;
    margin: 1px 6px 0 0;
    cursor: pointer;

    svg {
      width: 100%;
    }

    &:hover {
      ::v-deep {
        g,
        path,
        rect {
          fill: $primary-color !important;
        }
      }
    }
  }
}

$dark_border: #323232;
$dark_background: #323232;
</style>
