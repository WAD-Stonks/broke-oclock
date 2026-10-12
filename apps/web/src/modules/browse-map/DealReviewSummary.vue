<script setup lang="ts">
import type { DealVoteSummary } from '@broke-oclock/contracts/deals'
import { computed } from 'vue'

// Read-only view of the community evidence on a deal: "still on" and "gone" vote tallies and
// the comment count. The buttons are disabled on purpose: voting and commenting are wired up
// by the community module, and this panel only reports what the API already returns. The
// reason lives in the buttons' tooltip so it does not clutter the drawer.
const props = defineProps<{
  votes: DealVoteSummary
  commentCount: number
}>()

const NO_REPORTS = 'No reports yet. Be the first to say whether it still works.'
const NO_COMMENTS = 'No comments yet.'
const VOTING_NOTE = 'Voting and comments open once the community module ships.'

const totalVotes = computed(() => props.votes.alive + props.votes.dead)

const summary = computed(() =>
  totalVotes.value === 0
    ? NO_REPORTS
    : `${props.votes.alive} of ${totalVotes.value} ${totalVotes.value === 1 ? 'person says' : 'people say'} it is still on.`,
)

const commentsText = computed(() => {
  if (props.commentCount === 0) return NO_COMMENTS
  return `${props.commentCount} ${props.commentCount === 1 ? 'comment' : 'comments'}`
})
</script>

<template>
  <section class="deal-reviews" aria-labelledby="deal-reviews-title" data-testid="deal-reviews">
    <h3 id="deal-reviews-title" class="visually-hidden">Is this deal still on?</h3>

    <div class="deal-reviews__votes">
      <button type="button" class="browse-pill browse-pill--ink deal-reviews__vote" data-testid="vote-alive" disabled :title="VOTING_NOTE">
        Still on
        <span class="deal-reviews__count">{{ votes.alive }}</span>
      </button>
      <button type="button" class="browse-pill browse-pill--compact deal-reviews__vote" data-testid="vote-dead" disabled :title="VOTING_NOTE">
        Gone
        <span class="deal-reviews__count">{{ votes.dead }}</span>
      </button>
    </div>

    <p class="deal-reviews__summary">{{ summary }}</p>
    <p class="deal-reviews__comments">{{ commentsText }}</p>
  </section>
</template>

<style scoped>
.deal-reviews__votes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

/* Styled like the live buttons they will become; disabled only because voting is not wired yet. */
.deal-reviews__vote {
  justify-content: center;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-md);
  box-shadow: none;
}

.deal-reviews__vote:disabled {
  opacity: 1;
  cursor: not-allowed;
  transform: none;
}

.deal-reviews__count {
  font-weight: 500;
  opacity: 0.75;
}

.deal-reviews__summary,
.deal-reviews__comments {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--ink-muted);
}
</style>
