from datetime import datetime, timedelta, timezone

from app.config import settings


def _parse_steps(steps_str: str) -> list[int]:
    return [int(s.strip()) for s in steps_str.split(",") if s.strip()]


def review_card(
    card,
    rating: int,
) -> None:
    now = datetime.now(timezone.utc)
    learning_steps = _parse_steps(settings.flashcard_learning_steps)
    relearning_steps = _parse_steps(settings.flashcard_relearning_steps)
    graduating_interval = settings.flashcard_graduating_interval
    easy_interval = settings.flashcard_easy_interval
    easy_bonus = settings.flashcard_easy_bonus
    maximum_interval = settings.flashcard_maximum_interval
    minimum_ease = settings.flashcard_minimum_ease

    card.last_review = now
    card.last_rating = rating
    card.updated_at = now

    if card.state == "new":
        _handle_new(card, rating, now, learning_steps, graduating_interval, easy_interval, minimum_ease)
    elif card.state in ("learning", "relearning"):
        steps = learning_steps if card.state == "learning" else relearning_steps
        _handle_learning(card, rating, now, steps, graduating_interval, minimum_ease)
    elif card.state == "review":
        _handle_review(card, rating, now, easy_bonus, maximum_interval, minimum_ease, relearning_steps)


def _handle_new(card, rating, now, learning_steps, graduating_interval, easy_interval, minimum_ease):
    if rating == 1:
        card.state = "learning"
        card.step = 0
        card.due = now + timedelta(minutes=learning_steps[0])
    elif rating == 2:
        card.state = "learning"
        card.step = min(1, len(learning_steps) - 1)
        if len(learning_steps) > 1:
            card.due = now + timedelta(minutes=learning_steps[1])
        else:
            card.due = now + timedelta(minutes=learning_steps[0])
    elif rating == 3:
        card.state = "review"
        card.interval = graduating_interval
        card.repetitions = 1
        card.due = now + timedelta(days=graduating_interval)
    elif rating == 4:
        card.state = "review"
        card.interval = easy_interval
        card.repetitions = 1
        card.ease_factor = max(card.ease_factor + 0.15, minimum_ease)
        card.due = now + timedelta(days=easy_interval)


def _handle_learning(card, rating, now, steps, graduating_interval, minimum_ease):
    if rating == 1:
        card.step = 0
        card.due = now + timedelta(minutes=steps[0])
    elif rating == 2:
        card.step = min(card.step + 1, len(steps) - 1)
        step_idx = min(card.step, len(steps) - 1)
        card.due = now + timedelta(minutes=steps[step_idx])
    elif rating >= 3:
        if card.step + 1 >= len(steps):
            card.state = "review"
            card.interval = graduating_interval
            card.repetitions = 1
            card.due = now + timedelta(days=graduating_interval)
            if rating == 4:
                card.ease_factor = max(card.ease_factor + 0.15, minimum_ease)
        else:
            card.step += 1
            step_idx = min(card.step, len(steps) - 1)
            card.due = now + timedelta(minutes=steps[step_idx])


def _handle_review(card, rating, now, easy_bonus, maximum_interval, minimum_ease, relearning_steps):
    if rating == 1:
        card.state = "relearning"
        card.step = 0
        card.lapses += 1
        card.repetitions = 0
        card.ease_factor = max(card.ease_factor - 0.20, minimum_ease)
        if relearning_steps:
            card.due = now + timedelta(minutes=relearning_steps[0])
        else:
            card.due = now + timedelta(minutes=10)
    elif rating == 2:
        card.ease_factor = max(card.ease_factor - 0.15, minimum_ease)
        card.interval = max(1, int(card.interval * 1.2))
        card.interval = min(card.interval, maximum_interval)
        card.repetitions += 1
        card.due = now + timedelta(days=card.interval)
    elif rating == 3:
        card.interval = max(1, int(card.interval * card.ease_factor))
        card.interval = min(card.interval, maximum_interval)
        card.repetitions += 1
        card.due = now + timedelta(days=card.interval)
    elif rating == 4:
        card.ease_factor = max(card.ease_factor + 0.15, minimum_ease)
        card.interval = max(1, int(card.interval * card.ease_factor * easy_bonus))
        card.interval = min(card.interval, maximum_interval)
        card.repetitions += 1
        card.due = now + timedelta(days=card.interval)
