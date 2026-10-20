/** Form owns unsaved input; query refreshes never reset it and failed saves retain it. */
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link, useBeforeUnload, useNavigate, useParams } from 'react-router';

import { ApiError } from '../api/client';
import { saveHymn, textFields } from '../api/library';
import type { Categories, Hymn, HymnInput, TextField } from '../api/library';
import { useSession } from '../features/auth/SessionProvider';
import { CategorySelect } from '../features/hymns/CategorySelect';
import { useCategories, useHymn, useRefreshLibrary } from '../features/hymns/queries';

type Values = Record<TextField, string> & {
  title: string;
  language_id: string;
  genre_ids: number[];
  season_ids: number[];
  placement_ids: number[];
  tag_ids: number[];
  estimated_duration_minutes: string;
  is_polyphonic: boolean;
  voices: { name: string }[];
};
const multiFields = [
  ['genre_ids', 'genres', 'genres', 'Genres'],
  ['placement_ids', 'mass-placements', 'placements', 'Suitable placements'],
  ['season_ids', 'liturgical-seasons', 'seasons', 'Suitable seasons'],
  ['tag_ids', 'tags', 'tags', 'Tags'],
] as const;
const lengths: Partial<Record<TextField, number>> = {
  latin_title: 255,
  tempo: 50,
  alternate_title: 255,
  first_line: 500,
  composer: 255,
  arranger: 255,
  source_or_hymnal: 255,
  hymnal_number: 100,
  default_key: 50,
  audio_url: 1000,
  sheet_music_url: 1000,
};

export function HymnFormPage() {
  const { id } = useParams();
  const { user } = useSession();
  const categories = useCategories();
  const hymn = useHymn(id);
  function retry() {
    void categories.refetch();
    if (id) void hymn.refetch();
  }
  if (user?.role === 'Viewer')
    return (
      <section>
        <h1>Read-only access</h1>
        <p>Your account can view hymns. Ask your coordinator for editing access.</p>
        <Link to="/hymns">Return to library</Link>
      </section>
    );
  if (categories.isPending || (id && hymn.isPending))
    return <p role="status">Loading hymn form…</p>;
  const error = categories.error ?? hymn.error;
  if (!categories.data || (id && !hymn.data))
    return (
      <section role="alert">
        <h1>Unable to open hymn form</h1>
        <p>{error?.message}</p>
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
        <Link to="/hymns">Return to library</Link>
      </section>
    );
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          Unable to refresh hymn form: {error.message} Your input has been kept.{' '}
          <button className="button secondary" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      <HymnForm key={id ?? 'new'} hymn={hymn.data} categories={categories.data} />
    </>
  );
}

function HymnForm({ hymn, categories }: { hymn?: Hymn; categories: Categories }) {
  const navigate = useNavigate();
  const refresh = useRefreshLibrary();
  const [failure, setFailure] = useState<string | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [removePdf, setRemovePdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const ordinaryTime = categories['liturgical-seasons'].find(
    (row) =>
      row.slug === 'ordinary-time' &&
      (row.is_active || hymn?.seasons.some((season) => season.id === row.id)),
  );
  // An inactive category may be retained, but must never be added automatically.
  const preserveSeasonNeutral = Boolean(hymn?.is_season_neutral && !ordinaryTime);
  const form = useForm<Values>({
    defaultValues: {
      ...(Object.fromEntries(textFields.map(([name]) => [name, hymn?.[name] ?? ''])) as Record<
        TextField,
        string
      >),
      title: hymn?.title ?? '',
      language_id: hymn ? String(hymn.language.id) : '',
      genre_ids: hymn?.genres.map((row) => row.id) ?? [],
      season_ids: [
        ...new Set([
          ...(hymn?.seasons.map((row) => row.id) ?? []),
          ...(hymn?.is_season_neutral && ordinaryTime ? [ordinaryTime.id] : []),
        ]),
      ],
      placement_ids: hymn?.placements.map((row) => row.id) ?? [],
      tag_ids: hymn?.tags.map((row) => row.id) ?? [],
      estimated_duration_minutes: hymn?.estimated_duration_minutes ?? '',
      is_polyphonic: hymn?.is_polyphonic ?? false,
      voices: hymn?.voices.map((name) => ({ name })) ?? [],
    },
  });
  const {
    register,
    control,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = form;
  const voiceFields = useFieldArray({ control, name: 'voices' });
  const polyphonic = form.watch('is_polyphonic');
  const title = form.watch('title');
  const language = categories.languages.find((row) => String(row.id) === form.watch('language_id'));
  const showLatinTitle =
    ['arabic', 'syriac'].includes(language?.slug ?? '') ||
    [...title].some((letter) => /\p{Letter}/u.test(letter) && !/\p{Script=Latin}/u.test(letter)) ||
    Boolean(form.watch('latin_title'));

  const dirty = isDirty || Boolean(pdf) || removePdf;
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  async function submit(values: Values) {
    setFailure(null);
    setPdfError(null);
    let invalid = false;
    function reject(field: keyof Values, message: string) {
      setError(field, { message }, { shouldFocus: !invalid });
      invalid = true;
    }
    if (!values.title.trim()) reject('title', 'Enter a hymn title.');
    if (!values.language_id) reject('language_id', 'Choose a language.');
    if (!values.placement_ids.length) reject('placement_ids', 'Choose at least one placement.');
    if (!preserveSeasonNeutral && !values.season_ids.length)
      reject('season_ids', 'Choose at least one season.');
    const voices = values.voices.map((voice) => voice.name.trim());
    if (new Set(voices.map((voice) => voice.toLocaleLowerCase())).size !== voices.length)
      reject('voices', 'Each voice needs a distinct name.');
    const duration = values.estimated_duration_minutes.trim();
    if (
      duration &&
      (!/^\d+(\.\d{1,2})?$/.test(duration) || Number(duration) <= 0 || Number(duration) >= 10000)
    )
      reject(
        'estimated_duration_minutes',
        'Enter positive minutes with at most two decimals (below 10000).',
      );
    for (const field of ['audio_url', 'sheet_music_url'] as const) {
      if (values[field].trim()) {
        try {
          const url = new URL(values[field].trim());
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid scheme');
        } catch {
          reject(field, 'Enter a full HTTP or HTTPS URL.');
        }
      }
    }
    if (invalid) return;
    const metadata = Object.fromEntries(
      textFields.map(([name]) => [name, values[name].trim() || null]),
    ) as Record<TextField, string | null>;
    const payload: HymnInput = {
      ...metadata,
      title: values.title.trim(),
      language_id: Number(values.language_id),
      genre_ids: values.genre_ids,
      season_ids: values.season_ids,
      placement_ids: values.placement_ids,
      tag_ids: values.tag_ids,
      is_season_neutral: preserveSeasonNeutral,
      estimated_duration_minutes: duration || null,
      is_polyphonic: values.is_polyphonic,
      voices,
      ...(removePdf ? { remove_sheet_music_pdf: true } : {}),
    };
    try {
      const saved = await saveHymn(payload, hymn?.id, pdf);
      form.reset(values);
      setPdf(null);
      setRemovePdf(false);
      await refresh();
      navigate(`/hymns/${saved.id}`, { replace: true, state: { saved: true } });
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'Unable to save. Your input has been kept.',
      );
      if (error instanceof ApiError) {
        for (const [name, messages] of Object.entries(error.fields)) {
          if (name === 'sheet_music_pdf' && Array.isArray(messages))
            setPdfError(messages.join(' '));
          if (name in values && Array.isArray(messages) && typeof messages[0] === 'string')
            setError(name as keyof Values, { message: messages[0] }, { shouldFocus: true });
        }
      }
    }
  }
  function cancel() {
    if (!dirty || window.confirm('Discard unsaved hymn changes?'))
      navigate(hymn ? `/hymns/${hymn.id}` : '/hymns');
  }
  function metadataField(name: TextField, label: string) {
    return (
      <label
        className={`field ${name === 'notes' || name === 'lyrics' ? 'full-width' : ''}`}
        key={name}
      >
        {label}
        {name === 'notes' || name === 'lyrics' ? (
          <textarea
            dir="auto"
            rows={5}
            aria-invalid={Boolean(errors[name])}
            aria-describedby={errors[name] ? `${name}-error` : undefined}
            {...register(name)}
          />
        ) : (
          <input
            dir="auto"
            type={name.endsWith('_url') ? 'url' : 'text'}
            maxLength={lengths[name]}
            aria-invalid={Boolean(errors[name])}
            aria-describedby={errors[name] ? `${name}-error` : undefined}
            {...register(name)}
          />
        )}
        {errors[name] && (
          <span id={`${name}-error`} className="field-error">
            {errors[name]?.message}
          </span>
        )}
      </label>
    );
  }
  return (
    <>
      <div className="form-heading">
        <Link className="text-button" to="/hymns">
          ← Library
        </Link>
        <h1 className="page-title">{hymn ? 'Edit hymn' : 'Add hymn'}</h1>
      </div>
      <form className="hymn-form" onSubmit={form.handleSubmit(submit)} noValidate>
        <fieldset className="form-section" disabled={isSubmitting}>
          <legend>Basic information</legend>
          <div className="form-grid">
            <label className="field full-width">
              <span>
                Title{' '}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </span>
              <input
                dir="auto"
                maxLength={255}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'title-error' : undefined}
                aria-required="true"
                {...register('title', { required: 'Enter a hymn title.' })}
              />
              {errors.title && (
                <span className="field-error" id="title-error">
                  {errors.title.message}
                </span>
              )}
            </label>
            <label className="field">
              <span>
                Language{' '}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
              </span>
              <select
                aria-required="true"
                {...register('language_id', { required: 'Choose a language.' })}
                aria-invalid={Boolean(errors.language_id)}
                aria-describedby={errors.language_id ? 'language-error' : undefined}
              >
                <option value="">Choose a language</option>
                {categories.languages
                  .filter((row) => row.is_active || row.id === hymn?.language.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {!row.is_active && ' (inactive)'}
                    </option>
                  ))}
              </select>
              {errors.language_id && (
                <span className="field-error" id="language-error">
                  {errors.language_id.message}
                </span>
              )}
            </label>
            {showLatinTitle && metadataField('latin_title', 'Latin Characters Name')}
            <label className="field">
              Duration (minutes)
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                max="9999.99"
                step="0.01"
                aria-invalid={Boolean(errors.estimated_duration_minutes)}
                aria-describedby={errors.estimated_duration_minutes ? 'duration-error' : undefined}
                {...register('estimated_duration_minutes')}
              />
              {errors.estimated_duration_minutes && (
                <span className="field-error" id="duration-error">
                  {errors.estimated_duration_minutes.message}
                </span>
              )}
            </label>
          </div>
          <Controller
            control={control}
            name="is_polyphonic"
            render={({ field }) => (
              <label className="checkbox-choice polyphony-choice">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    if (
                      !enabled &&
                      voiceFields.fields.length &&
                      !window.confirm('Turn off polyphony and remove all voice names?')
                    )
                      return;
                    if (!enabled) voiceFields.replace([]);
                    field.onChange(enabled);
                  }}
                />
                Polyphony (multiple voices)
              </label>
            )}
          />
          {polyphonic && (
            <div className="voice-editor" role="group" aria-label="Voices">
              <p className="tiny">Name the parts your team sings, such as Soprano or Alto.</p>
              {voiceFields.fields.map((voice, index) => (
                <div className="voice-row" key={voice.id}>
                  <label className="field">
                    <span className="tiny">
                      Voice {index + 1}{' '}
                      <span className="required-mark" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      dir="auto"
                      placeholder="Voice name"
                      aria-required="true"
                      maxLength={80}
                      aria-invalid={Boolean(errors.voices?.[index]?.name)}
                      aria-describedby={
                        errors.voices?.[index]?.name ? `voice-${index}-error` : undefined
                      }
                      {...register(`voices.${index}.name`, { required: 'Enter a voice name.' })}
                    />
                    {errors.voices?.[index]?.name && (
                      <span className="field-error" id={`voice-${index}-error`}>
                        {errors.voices[index]?.name?.message}
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Remove voice ${index + 1}`}
                    onClick={() => voiceFields.remove(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {errors.voices?.message && (
                <p className="field-error" role="alert">
                  {errors.voices.message}
                </p>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={voiceFields.fields.length >= 32}
                onClick={() => voiceFields.append({ name: '' }, { shouldFocus: true })}
              >
                Add voice
              </button>
            </div>
          )}
        </fieldset>
        <fieldset className="form-section" disabled={isSubmitting}>
          <legend>Classification</legend>
          {preserveSeasonNeutral && (
            <p className="tiny muted">
              This hymn remains suitable for any season while Ordinary Time is unavailable.
            </p>
          )}
          <div className="classification-grid">
            {multiFields.map(([field, kind, relation, label]) => (
              <Controller
                key={field}
                control={control}
                name={field}
                render={({ field: controller }) => (
                  <CategorySelect
                    label={label}
                    required={
                      field === 'placement_ids' ||
                      (field === 'season_ids' && !preserveSeasonNeutral)
                    }
                    choices={categories[kind]}
                    value={controller.value}
                    onChange={controller.onChange}
                    retain={hymn?.[relation].map((row) => row.id)}
                    error={errors[field]?.message}
                  />
                )}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="form-section" disabled={isSubmitting}>
          <legend>Sheet music and lyrics</legend>
          {hymn?.sheet_music_pdf && !removePdf && !pdf && (
            <div className="attachment-info">
              <a className="text-button" href={hymn.sheet_music_pdf.url}>
                {hymn.sheet_music_pdf.name}
              </a>
              <button type="button" className="text-button" onClick={() => setRemovePdf(true)}>
                Remove attached PDF
              </button>
            </div>
          )}
          {removePdf && (
            <p className="tiny">
              The attached PDF will be removed when you save.{' '}
              <button type="button" className="text-button" onClick={() => setRemovePdf(false)}>
                Undo
              </button>
            </p>
          )}
          <label className="field">
            Sheet music PDF
            <input
              type="file"
              accept=".pdf,application/pdf"
              aria-invalid={Boolean(pdfError)}
              aria-describedby={pdfError ? 'pdf-error' : 'pdf-help'}
              onChange={(event) => {
                setPdf(event.target.files?.[0] ?? null);
                setPdfError(null);
                if (event.target.files?.length) setRemovePdf(false);
              }}
            />
          </label>
          <p className="tiny" id="pdf-help">
            Optional · PDF up to 10 MB. {pdf && `Selected: ${pdf.name}`}
          </p>
          {pdfError && (
            <p className="field-error" id="pdf-error">
              {pdfError}
            </p>
          )}
          {metadataField('sheet_music_url', 'Sheet music URL')}
          {metadataField('lyrics', 'Lyrics')}
          <div className="form-grid">
            {metadataField('default_key', 'Default key')}
            {metadataField('tempo', 'Tempo')}
          </div>
        </fieldset>
        <details
          className="form-section optional-details"
          open={
            textFields.some(
              ([name]) =>
                errors[name] &&
                !['sheet_music_url', 'lyrics', 'default_key', 'tempo', 'latin_title'].includes(
                  name,
                ),
            )
              ? true
              : undefined
          }
        >
          <summary>
            More hymn details <span className="tiny">Composer, lyrics reference, notes…</span>
          </summary>
          <fieldset disabled={isSubmitting} className="optional-fields">
            <legend className="sr-only">Optional hymn metadata</legend>
            <div className="form-grid">
              {textFields
                .filter(
                  ([name]) =>
                    !['sheet_music_url', 'lyrics', 'default_key', 'tempo', 'latin_title'].includes(
                      name,
                    ),
                )
                .map(([name, label]) => metadataField(name, label))}
            </div>
          </fieldset>
        </details>
        {failure && (
          <p className="notice error" role="alert">
            {failure} Your input has been kept.
          </p>
        )}
        <div className="form-actions sticky-form-actions">
          <button className="button primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save hymn'}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={cancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
