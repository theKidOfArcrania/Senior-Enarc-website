<template>
  <v-app>
    <v-app-bar
      app
      color="#FB8C00"
      dark
    >
      <div class="d-flex align-center">
        <v-img
          class="shrink mr-2"
          contain
          src="./assets/Temoc_Secondary_Orange.png"
          transition="scale-transition"
          width="80"
        />
      </div>

      <v-spacer></v-spacer>
    </v-app-bar>

    <v-content>
      <PortalSelect/>
    </v-content>
  </v-app>
</template>

<script>
import PortalSelect from './components/PortalSelect';

export default {
  name: 'App',

  components: {
    PortalSelect,
  },

  data: () => ({
    //
  }),
};
</script>
