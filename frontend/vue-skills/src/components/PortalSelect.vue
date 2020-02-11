<template>
  <v-container>
      <v-row class="text-center">
          <v-col cols="12">
              <v-img
                :src="require('../assets/ut-dallas-logo02.png')"
                class="my-3"
                contain
                height="200"
              />
          </v-col>
      </v-row>

      <v-row>
          <v-col>
              <v-card outlined>
                <v-row class="pl-4">
                    <v-col>
                        <v-icon>mdi-domain</v-icon>
                        Company Portal
                    </v-col>
                </v-row>
                <v-row
                :justify="end"
                class="pl-3">
                    <v-btn text>Enter</v-btn>
                </v-row>
              </v-card>
          </v-col>
          <v-col>
              <v-card outlined>
                <v-row class="pl-4">
                    <v-col>
                        <v-icon>mdi-school</v-icon>
                        Student Portal
                    </v-col>
                </v-row>
                <v-row
                :justify="end"
                class="pl-3">
                    <v-btn text>Enter</v-btn>
                </v-row>
              </v-card>
          </v-col>
          <v-col>
              <v-card outlined>
                <v-row class="pl-4">
                    <v-col>
                        <v-icon>mdi-teach</v-icon>
                        Staff Portal
                    </v-col>
                </v-row>
                <v-row
                :justify="end"
                class="pl-3">
                    <v-btn text>Enter</v-btn>
                </v-row>
              </v-card>
          </v-col>
      </v-row>
  </v-container>
</template>

<script>
export default {
  name: 'Skills',
  props: {
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
