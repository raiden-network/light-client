<template>
  <div id="notification-panel-wrapper">
    <div class="notification-panel">
      <div class="notification-panel__close">
        <v-icon icon @click="onModalBackClicked()">mdi-close</v-icon>
      </div>
      <div class="notification-panel__notification-wrapper">
        <notification-card />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import NavigationMixin from '@/mixins/navigation-mixin';
import NotificationCard from '@/components/notification-panel/NotificationCard.vue';

@Component({
  components: {
    NotificationCard
  }
})
export default class NotificationPanel extends Mixins(NavigationMixin) {}
</script>

<style scoped lang="scss">
@import '@/scss/mixins';
@import '@/scss/colors';

#notification-panel-wrapper {
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
  position: absolute;
  z-index: 20;
  @include respond-to(handhelds) {
    height: 100vh;
    width: 100%;
  }
}

.notification-panel {
  background-color: $card-background;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  height: 844px;
  margin-top: 25px;
  width: 620px;
  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
    margin-top: 0;
    width: 100%;
  }

  &__close {
    display: flex;
    justify-content: flex-end;
    margin: 30px 30px 0 0;
  }

  &__notification-wrapper {
    margin: 20px 40px 0 40px;
  }
}
</style>
