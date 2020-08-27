<template>
  <v-card class="notification-card" flat>
    <v-row class="notification-card__content" no-gutters>
      <v-avatar class="notification-card__content__icon" size="44" rounded>
        <img :src="require(`@/assets/${notification.icon}`)" />
      </v-avatar>
      <div class="notification-card__content__details">
        <span class="notification-card__content__details__title">
          {{ notification.title }}
        </span>
        <div class="notification-card__content__details__description">
          <p v-for="(word, index) in splitDescription" :key="index">
            <template v-if="isAddress(word)">
              <address-display
                class="notification-card__content__details__description__address"
                :address="word"
              />
            </template>
            <template v-else>
              {{ word }}
            </template>
          </p>
        </div>
        <span class="notification-card__content__details__date">
          {{ notification.received | formatDate }}
        </span>
      </div>
      <v-btn x-small icon @click="notificationDelete(notification.id)">
        <img :src="require('@/assets/trash.svg')" />
      </v-btn>
    </v-row>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { NotificationPayload } from '@/store/notifications/types';
import { createNamespacedHelpers } from 'vuex';
import AddressDisplay from '@/components/AddressDisplay.vue';

const { mapMutations } = createNamespacedHelpers('notifications');

@Component({
  components: {
    AddressDisplay,
  },
  methods: {
    ...mapMutations(['notificationDelete']),
  },
})
export default class NotificationCard extends Vue {
  splitDescription: string[] = [];
  notificationDelete!: (id: number) => void;

  @Prop({ required: true })
  notification!: NotificationPayload;

  isAddress(address: string): boolean {
    return /^0x.+/.test(address);
  }

  mounted() {
    this.splitDescription = this.notification.description.split(/\s+/);
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';
@import '@/scss/scroll';

.notification-card {
  background-color: $notification-card-bg;
  border-radius: 16px !important;
  height: 88px;

  &__content {
    height: 100%;
    padding: 16px;

    &__icon {
      background-color: $notification-icon-bg;
      padding: 4px;
    }

    &__details {
      display: flex;
      flex: 1;
      flex-direction: column;
      margin-left: 16px;

      &__title {
        color: $primary-color;
      }

      &__description {
        color: $secondary-text-color;
        display: flex;
        font-size: 14px;

        > p {
          padding-right: 4px;
          margin: 0;
        }

        &__address {
          color: $secondary-text-color;
          font-size: 14px;
          padding-top: 1px;
        }
      }

      &__date {
        color: $secondary-text-color;
        font-size: 12px;
      }
    }
  }
}
</style>
