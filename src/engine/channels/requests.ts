import {assocPath, uniq} from "ramda"
import {seconds} from "hurdak"
import {now} from "@coracle.social/lib"
import {relayFeed, filterFeed} from "@coracle.social/feeds"
import {sessions} from "src/engine/session/state"
import {session} from "src/engine/session/derived"
import {loadPubkeys, subscribe} from "src/engine/network/utils"
import {feedLoader} from "src/engine/events/requests"
import {hints} from "src/engine/relays/utils"
import {channels} from "./state"

export const loadAllMessages = async ({reload = false} = {}) => {
  const {pubkey, nip24_messages_last_synced = 0} = session.get()
  const since = reload ? 0 : Math.max(0, nip24_messages_last_synced - seconds(6, "hour"))

  sessions.update(assocPath([pubkey, "nip24_messages_last_synced"], now()))

  // To avoid unwrapping everything twice, listen to channels and load pubkeys there
  const unsubscribePubkeys = channels.throttle(1000).subscribe($channels => {
    loadPubkeys($channels.flatMap(c => c.members || []))
  })

  const feed = relayFeed(
    hints.User().getUrls(),
    filterFeed({kinds: [4], authors: [pubkey], since}, {kinds: [4, 1059], "#p": [pubkey], since}),
  )

  let exhausted = false

  const load = await feedLoader.getLoader(feed, {
    onExhausted: () => {
      exhausted = true
    },
  })

  while (!exhausted) {
    await load(100)
  }

  unsubscribePubkeys()
}

export const listenForMessages = (pubkeys: string[]) => {
  const {pubkey} = session.get()
  const allPubkeys = uniq(pubkeys.concat(pubkey))

  return subscribe({
    skipCache: true,
    relays: hints.Messages(pubkeys).getUrls(),
    filters: [
      {kinds: [4], authors: allPubkeys, "#p": allPubkeys},
      {kinds: [1059], "#p": [pubkey]},
    ],
  })
}
