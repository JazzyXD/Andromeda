
# Learning Guide

Teach material the user hasn't learned yet, from their own course materials, as one HTML guide that reads like a clean textbook chapter, organized by week, with a quiz at the end of every week.

**Which skill:** this one is for material the user hasn't learned yet, even if a test is coming soon. Material they've already learned and want to review goes to the study-guide skill. Use only one of the two; never load study-guide alongside this one. If it isn't clear whether the user has learned the material yet, ask one short question before starting.

## 1. Before building

1. Load the guide-core skill and read section 1 (what a good guide looks like) carefully. It holds the ground rules, the week structure and week quizzes, exam matching, item writing, the page styling with the quiz and progress scripts, and the quality check. Follow it throughout.
2. Work out the basics: course name, which weeks or chapters, textbook (or none), test date, today's date, and the exam format (question types, number of questions, what it emphasizes). Look in the materials first.
3. Pick the subject skill by what the course mostly asks students to do:

| The course mostly asks you to | Subject skill | For example |
|---|---|---|
| Recognize concepts, remember studies, compare theories | guide-social-sciences | Psychology, sociology, anthropology, social psychology |
| Run procedures and calculations | guide-procedural | Accounting, tax calculations, statistics, finance |
| Apply rules or standards with conditions and exceptions to cases | guide-rules | Auditing, law, professional ethics, tax rules |
| Explain processes, structures and mechanisms | guide-sciences | Biology, anatomy, physiology, chemistry |
| Analyze readings, arguments and thinkers | guide-humanities | Religious studies, philosophy, history |

   Watch for borderline courses: biological or neuro psychology may fit sciences better than social sciences; a psych statistics or research methods course is procedural; Income Tax is procedural plus rules. A clearly mixed course can use a second subject skill for the part it covers; never more than two.
4. **Confirm before building.** A wrong subject skill wastes the whole build, so always check it in one short message before writing anything: name the subject skill you picked and why in a few words, and offer the others as alternatives (tappable choices if available). Put any missing basics (usually the test date or exam format) in the same message, and if the test is less than about 4 days away with many topics, ask whether they want Short-on-time mode (section 5) there too. Skip the check only if the user already named the subject type or confirmed it earlier in the conversation.
5. Load the confirmed subject skill or skills. If one isn't available, follow guide-core alone and say so in one line.

## 2. Delivery

- Build the whole guide in one go: every week, every topic, every quiz. Don't stop partway or ask the user to say "next".
- Build it in parts so nothing gets thinned: write each week to its own file, then join them into one self-contained HTML page and publish it as one artifact (or an .html file if artifacts aren't available).
- Length follows the material (guide-core section 1). There is no per-topic word target. A topic that comes from one slide is short; a topic built on a model or procedure is longer.
- Teach, don't copy. Every testable point appears, explained in plain sentences, but slides aren't reproduced in full.
- The user learns by reading a topic, closing the guide, and writing notes from memory. The guide supports that by being easy to read and follow, not by adding prompts.

## 3. Layout

**Top of the guide**
- Title, a one-line course and test line, and the table of contents (weeks, each with its topics).
- Big picture: a short paragraph on what the material is about and how its parts fit, plus the course's frame as a flow if it has one (for example problem, explanation, fix). If the material leans on an earlier idea, refresh it here in a sentence or two.
- How to use, one short paragraph, said only here: read a topic, close the guide and write your notes from memory, then check and mark what you missed; take the week quiz before moving on. It asks how sure you feel first, and scores save in this browser.
- Guess-first quiz: 3 questions in the exam's style (id `warmup-quiz`, no `data-ask`). The user isn't expected to know them yet.
- Pacing plan: only when there's a test date and more than one week. A short list, one line per session.

**Each week** (h2 with its meta line), with its topics (h3) in order. Each topic:
1. The teaching, in the subject skill's note format. Plain text by default; boxes only for the content guide-core section 7 lists.
2. Worked examples only where the subject skill calls for them (procedures, annotated cases), with answers to any blanks in a collapsed section right after the example (no divider or gap).

Nothing else goes in a topic: no out-loud checks, no per-topic quiz, no notes reminder, no summary.

**End of each week:** the week quiz from guide-core section 4 (id `wN-quiz`, with `data-ask`). Written or calculation practice goes in a TRY IT box right after it, with collapsed answers right under the box.

**End of the guide** depends on how many weeks the guide covers.
- **One week:** the week quiz is the last thing on the page. No final quiz, no confidence table (the quiz's score screen already gives the verdict), no connections section, no CHECK list (CHECK: lines already sit where the issues are).
- **Two or more weeks,** in this order:
  1. Final mixed quiz (id `final-quiz`, with `data-ask`) in the exam's format, built from look-alikes that sit in different weeks plus the main ideas of each week. Its size follows how much there is to mix.
  2. How the weeks connect: a few sentences or a flow, only if the weeks really build on each other.
  3. CHECK: items in one list for the instructor, if there are any.
  4. Confidence table, always the very last thing: Week | How sure you felt | First-try score | What to do, one row per week plus one for `final-quiz`, each cell using that quiz's id (`data-conf`, `data-score`, `data-flag`). One line under it: review any week marked "Review first" before the others.

In the chat reply that delivers the guide (not on the page), suggest a review guide a few days before the test, as a separate request.

## 4. After delivering

When the user sends answers or questions about the guide, check them per guide-core (hint first, then the full fix).

## 5. Short-on-time mode

Use only if the user chose it:
- Order topics within each week by how likely they are to be tested.
- Teach more tightly: the definitions, models, studies and procedures the exam needs, with one example each.
- Keep every week quiz, and the final mixed quiz if there's more than one week.
- Same layout, hidden answers and checked math.

## 6. Quality check (before publishing)

Run guide-core's quality check, especially the box audit and the read-through. Then confirm: every week ends with its quiz, nothing sits inside a topic except teaching and the subject skill's worked examples, the end of the guide matches the number of weeks, and any confidence table is last with cells that match the quiz ids.