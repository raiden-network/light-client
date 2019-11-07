<template>
  <v-row justify="center">
    <v-dialog v-model="display" persistent max-width="625">
      <v-card>
        <v-card-title>
          <v-col>
            <h1 class="confirmation-dialog__header">
              <slot name="header"></slot>
            </h1>
          </v-col>
        </v-card-title>
        <v-card-text>
          <p class="confirmation-dialog__message"><slot></slot></p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn class="confirmation-dialog__button" text @click="cancel()">
            {{ $t('confirmation-dialog.buttons.cancel') }}
          </v-btn>
          <v-btn
            class="confirmation-dialog__button confirmation-dialog__button__primary"
            text
            @click="confirm()"
          >
            {{ $t('confirmation-dialog.buttons.confirm') }}
          </v-btn>
          <v-spacer></v-spacer>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class ConfirmationDialog extends Vue {
  @Prop({ required: true })
  display!: boolean;

  confirm() {
    this.$emit('confirm');
  }

  cancel() {
    this.$emit('cancel');
  }
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
@import '../scss/dimensions';

::v-deep .theme--dark.v-sheet {
  background-color: $dialog-background;
}
.confirmation-dialog__header {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 24px;
  font-weight: bold;
  text-align: center;
}

.confirmation-dialog__message {
  color: #fafafa;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.confirmation-dialog__button {
  height: $dialog-button-height;
  width: 135px;
  border: 2px solid $primary-color;
  border-radius: 29px;
  text-transform: capitalize;
  margin-left: 15px;
  margin-right: 15px;
  margin-bottom: 8px;
}

.confirmation-dialog__button__primary {
  background-color: $primary-color !important;
}
</style>
