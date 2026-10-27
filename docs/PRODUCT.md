# Glintree

**Learn a little. Keep it growing.**

Glintree turns reading and watching into learning. A word in a story, an idea in
an article, and a concept in a technical course should all be easy to keep,
understand in context, and remember later. Languages are a primary use case;
the product also serves people learning subjects or following their curiosity.

Glintree is an independent product built on the TextReadsFast reading foundation.
Language Reactor inspires contextual word study, but the broader unit here is a
**learning item**: a word, phrase, or concept. We retain the original MIT notices
and the shared reading core. The repository and remotes keep their current names.

## Two ways to learn

- **Along the way:** watch or read normally, notice list colours and learning
  progress, inspect a word when curious, and keep its source context.
- **On purpose:** import a syllabus or word list, capture phrases and concepts,
  write explanations and examples, and revisit them through review cards.

The reader remains useful without saving anything. Video follows its own clock;
article pacing stays optional. Learning controls should not dominate the content.

## First working foundation

- One extension-local collection shared by articles and YouTube.
- Items identified by normalized term, language, and type; source spelling stays
  intact. Hindi/Bengali romanization changes display, never the saved source word.
- Editable meanings, examples, multiple list/topic memberships, and new / learning /
  known progress. A concept can use language `und` to match across languages.
- Source excerpts and links, including video timestamps. Up to five contexts per item.
- CSV, TSV, plain text and JSON list import, with a preview. Existing personal
  meanings and review progress survive repeat imports. Each list has a colour.
- Exact whole-word/phrase matching, including segmented Han. Longest matching
  phrases win. List underlines and status fills preserve focal-letter geometry.
- Automatic cards for items with a meaning: reveal, Again, Remembered, or Known.
  Remembered starts at one day and doubles to a maximum of 180 days; Again uses
  ten minutes. This is a simple initial schedule, not a validated adaptive model.
- A searchable collection, review view, and portable JSON backup/merge restore.

Storage is local to the installed extension in the current browser profile.
No accounts, backend, translations, dictionary requests, or AI-generated answers
are introduced. Full articles remain temporary; only explicitly saved excerpts
become part of the collection. Existing settings and legacy records remain intact.

## Next product decisions

1. **Definitions and usage:** choose licensed dictionary sources per language,
   disclose attribution, and distinguish dictionary senses from personal notes.
   Chinese needs native headwords, readings, word segmentation and traditional /
   simplified handling; a generic English dictionary is insufficient.
2. **Word families:** add language-specific inflections and aliases without
   confusing similarly spelled words in different languages. Current matching
   is exact after case, Unicode and edge-punctuation normalization.
3. **Concept learning:** connect explanations to related concepts and source
   passages. Support prompts such as “explain why” and “apply this idea”, beyond
   vocabulary recognition. A CCNA topic list can already be imported as concepts.
4. **Contextual study:** consider translations, pronunciation, repeat-a-sentence,
   and alternate examples while retaining the simple watching/reading experience.
5. **Review quality and portability:** evolve scheduling and card types using
   real study feedback; consider Anki integration and optional cross-device sync
   only with explicit data ownership and privacy choices.

These are directions, not features presented as shipped. This branch establishes
the identity and a complete capture → collection → review loop first.

## Design direction

A quiet ink-and-teal workspace, an independent G/glint mark, and flat, readable
controls. One reading surface with familiar width/font handles; a compact capture
panel beside the content; a separate collection for deliberate study. Existing
caption colour themes remain available. Avoid a marketplace of profiles or a
study dashboard that crowds the video.
