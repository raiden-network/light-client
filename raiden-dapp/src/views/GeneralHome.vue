<template>
  <div class="general-screen-home">
    <v-row class="general-screen-home__identicon" no-gutters>
      <header-identicon />
    </v-row>
    <general-menu />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import HeaderIdenticon from '@/components/HeaderIdenticon.vue';
import GeneralMenu from '@/components/GeneralMenu.vue';

@Component({
  components: {
    HeaderIdenticon,
    GeneralMenu
  }
})
export default class GeneralHome extends Vue {}
</script>

<style scoped lang="scss">
.general-screen-home {
  &__identicon {
    align-self: center;
    border-bottom: solid 1px #707070;
    justify-content: center;
    margin: 0 64px 0 64px;
    padding-bottom: 30px;
  }

  ::v-deep {
    .header-identicon {
      &__blockie {
        height: 70px;
        width: 70px;
      }
    }
  }
}
</style>
