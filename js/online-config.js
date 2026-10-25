'use strict';
/* オンラインの設定。
   PF_SERVER_URL: Deno Deploy のサーバー（wss://…/ws）。ゲームを別の場所（GitHub Pages など）に置くときだけ入れる。
                  .deno.dev で配信しているときは空のままでよい。
   PF_FIREBASE_CONFIG: Firebase を使うときだけ入れる（無料プラン Spark）。
   どちらも空（null）なら、一人用のゲームとして遊べます。 */
window.PF_SERVER_URL = null;
window.PF_FIREBASE_CONFIG = null;
