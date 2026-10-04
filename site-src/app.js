(() => {
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  // Supabase Client Setup (Amethyst Submissions to Sigma Admin)
  const SUPABASE_URL = "https://skiicalwfmtjmoblalrq.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZH9uyIpwJ08wdlXMoCAEWA_AymPbP8U";
  const amethystSupabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  // Spotify Backend (Uses Sigma Label Vercel API with CORS or local/custom backend)
  const VERCEL_BACKEND_URL = "https://sigma-label-website.vercel.app";

  const glow = qs('.cursor-glow');
  let pointerX = 0;
  let pointerY = 0;
  window.addEventListener('pointermove', (event) => {
    pointerX = (event.clientX / innerWidth) * 2 - 1;
    pointerY = (event.clientY / innerHeight) * 2 - 1;
    if (glow) {
      glow.style.left = `${event.clientX}px`;
      glow.style.top = `${event.clientY}px`;
    }
  }, { passive: true });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.12 });
  qsa('.reveal').forEach((item) => revealObserver.observe(item));

  const railLinks = qsa('.rail a');
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      railLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${id}`));
    });
  }, { rootMargin: '-42% 0px -48%', threshold: 0 });
  qsa('.tracked-section').forEach((section) => sectionObserver.observe(section));

  // ==========================================
  // Spotify Releases, Player Drawer & Live Streams
  // ==========================================
  const releaseCards = qsa('.release-card');
  const totalStreamsEl = qs('#total-streams-val');
  
  // Base streams data for live ticker (verified from Spotify)
  const streamData = [
    { id: 1, base: 34346, current: 34346, el: qs('#streams-count-1') },
    { id: 2, base: 29379, current: 29379, el: qs('#streams-count-2') },
    { id: 3, base: 30994, current: 30994, el: qs('#streams-count-3') }
  ];

  let totalStreams = streamData.reduce((sum, item) => sum + item.current, 0);

  const formatStreams = (num) => {
    return num.toLocaleString('en-US');
  };

  const updateStreamsDisplay = () => {
    streamData.forEach(item => {
      if (item.el) item.el.textContent = formatStreams(item.current);
    });
    if (totalStreamsEl) totalStreamsEl.textContent = formatStreams(totalStreams);
  };

  // Dynamically load real stream counts from streams.json
  const loadRealStreams = async () => {
    try {
      const res = await fetch(`./streams.json?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.tracks && Array.isArray(data.tracks)) {
          data.tracks.forEach((track, index) => {
            if (streamData[index] && track.streams > 0) {
              streamData[index].current = track.streams;
              streamData[index].base = track.streams;
            }
          });
          if (data.total_streams > 0) {
            totalStreams = data.total_streams;
          }
          updateStreamsDisplay();
        }
      }
    } catch (e) {
      // Use pre-loaded HTML numbers
    }
  };
  loadRealStreams();

  // Toggle Player Drawer & Embed Spotify
  const toggleReleasePlayer = (card) => {
    const drawer = qs('.release-player-drawer', card);
    const isOpen = card.classList.contains('is-active');

    // Close all other drawers
    releaseCards.forEach(c => {
      if (c !== card) {
        c.classList.remove('is-active');
        const otherDrawer = qs('.release-player-drawer', c);
        if (otherDrawer) otherDrawer.hidden = true;
      }
    });

    if (isOpen) {
      card.classList.remove('is-active');
      if (drawer) drawer.hidden = true;
    } else {
      card.classList.add('is-active');
      if (drawer) {
        drawer.hidden = false;
        const container = qs('.spotify-iframe-container', drawer);
        if (container && !container.querySelector('iframe')) {
          const embedUrl = container.dataset.embedUrl || card.dataset.embedSrc;
          const iframe = document.createElement('iframe');
          iframe.src = embedUrl;
          iframe.width = '100%';
          iframe.height = '152';
          iframe.frameBorder = '0';
          iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
          iframe.loading = 'lazy';
          iframe.title = 'Spotify Player';
          container.appendChild(iframe);
        }
      }
    }
  };

  releaseCards.forEach(card => {
    const row = qs('.release-card-row', card);
    row?.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      toggleReleasePlayer(card);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target === card || e.target.closest('.release-open-btn') || e.target.closest('.release-card-row')) {
          e.preventDefault();
          toggleReleasePlayer(card);
        }
      }
    });
  });

  // Dynamic Spotify OEmbed Sync (fetches official covers dynamically from Spotify)
  const syncSpotifyCovers = async () => {
    releaseCards.forEach(async (card) => {
      const spotifyUrl = card.dataset.spotifyUrl;
      if (!spotifyUrl) return;
      try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const res = await fetch(oembedUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.thumbnail_url) {
            const img = qs('.release-cover', card);
            if (img) img.src = data.thumbnail_url;
          }
        }
      } catch (e) {
        // Fallback already rendered from Spotify CDN in HTML
      }
    });
  };
  syncSpotifyCovers();

  // Real-Time Live Streams Simulation Ticker
  const startLiveStreamsTicker = () => {
    setInterval(() => {
      const randomIndex = Math.floor(Math.random() * streamData.length);
      const increment = Math.floor(Math.random() * 3) + 1;
      const target = streamData[randomIndex];

      target.current += increment;
      totalStreams += increment;

      if (target.el) {
        target.el.textContent = formatStreams(target.current);
        target.el.classList.add('stream-increment-flash');
        setTimeout(() => target.el.classList.remove('stream-increment-flash'), 800);
      }
      if (totalStreamsEl) {
        totalStreamsEl.textContent = formatStreams(totalStreams);
      }
    }, 4500);
  };
  startLiveStreamsTicker();

  // Date Selectors
  const releaseDay = qs('[data-release-day]');
  const releaseMonth = qs('[data-release-month]');
  const releaseYear = qs('[data-release-year]');
  const updateDays = () => {
    if (!releaseDay || !releaseMonth || !releaseYear) return;
    const previous = releaseDay.value;
    const month = Number(releaseMonth.value) || 1;
    const year = Number(releaseYear.value) || new Date().getFullYear();
    const total = new Date(year, month, 0).getDate();
    releaseDay.replaceChildren(new Option('DD', ''));
    for (let day = 1; day <= total; day += 1) {
      const value = String(day).padStart(2, '0');
      releaseDay.append(new Option(value, value));
    }
    if (Number(previous) <= total) releaseDay.value = previous;
  };

  if (releaseDay && releaseMonth && releaseYear) {
    const now = new Date();
    for (let month = 1; month <= 12; month += 1) {
      const value = String(month).padStart(2, '0');
      releaseMonth.append(new Option(value, value));
    }
    for (let year = now.getFullYear(); year <= now.getFullYear() + 3; year += 1) {
      releaseYear.append(new Option(String(year), String(year)));
    }
    releaseYear.value = String(now.getFullYear());
    releaseMonth.addEventListener('change', updateDays);
    releaseYear.addEventListener('change', updateDays);
    updateDays();
  }

  // Legal Name Helpers
  function formatLegalName(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/(?:^|[\s\-'’/])\p{L}/gu, (c) => c.toUpperCase());
  }

  function handleLegalNameInput(input) {
    if (!input) return;
    const val = input.value;
    if (!val) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const formatted = val.toLowerCase().replace(/(?:^|[\s\-'’/])\p{L}/gu, (c) => c.toUpperCase());
    if (formatted !== val) {
      input.value = formatted;
      try { input.setSelectionRange(start, end); } catch {}
    }
  }

  function handleLegalNameBlur(input) {
    if (!input) return;
    input.value = formatLegalName(input.value);
  }

  function isValidLegalName(str) {
    if (!str || typeof str !== 'string') return false;
    const parts = str.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return false;
    return parts.every((part) => part.length >= 2 && /\p{L}/u.test(part));
  }

  // Duplicate Email Validation
  function validateDuplicateEmails() {
    const blocks = qsa('[data-artist]', artistsContainer);
    const emailMap = new Map();
    blocks.forEach((artist, idx) => {
      const emailInput = qs("input[name^='artist_email_']", artist);
      const email = (emailInput?.value || '').trim().toLowerCase();
      const altToggle = qs('input[data-alt-toggle]', artist);
      const isAlt = Boolean(altToggle && altToggle.checked);
      if (emailInput) emailInput.setCustomValidity('');
      if (email) {
        if (!emailMap.has(email)) emailMap.set(email, []);
        emailMap.get(email).push({ index: idx + 1, input: emailInput, isAlt });
      }
    });

    for (const [email, list] of emailMap.entries()) {
      if (list.length > 1) {
        list.forEach((item, idx) => {
          if (idx > 0 && !item.isAlt && item.input) {
            item.input.setCustomValidity(`Artist #${item.index} has the same email. Enable "That's my alt account" if this is your alternate alias.`);
          }
        });
      }
    }
  }

  // Artist Management
  const artistsContainer = qs('#artists-container');
  const addArtistButton = qs('#add-artist');

  const updateArtistNumbers = () => {
    const blocks = qsa('[data-artist]', artistsContainer);
    blocks.forEach((artist, index) => {
      artist.dataset.index = String(index);
      qs('.artist-card-head strong', artist).textContent = `Artist #${index + 1}`;
      const removeBtn = qs('.remove-artist', artist);
      if (removeBtn) {
        removeBtn.style.display = index === 0 ? 'none' : 'inline-block';
        removeBtn.setAttribute('aria-label', `Remove artist ${index + 1}`);
      }

      const nameInput = qs("input[name^='artist_name_']", artist);
      if (nameInput) {
        nameInput.name = `artist_name_${index}`;
        nameInput.id = `artist_name_${index}`;
      }

      const legalInput = qs("input[name^='legal_name_']", artist);
      if (legalInput) {
        legalInput.name = `legal_name_${index}`;
        legalInput.id = `legal_name_${index}`;
      }

      const emailInput = qs("input[name^='artist_email_']", artist);
      if (emailInput) {
        emailInput.name = `artist_email_${index}`;
        emailInput.id = `artist_email_${index}`;
      }

      const altSwitchLabel = qs('.platform-field[data-platform="email"] .availability-switch', artist);
      const altCheckbox = qs('input[data-alt-toggle]', artist);
      if (index === 0) {
        if (altSwitchLabel) altSwitchLabel.style.display = 'none';
        if (altCheckbox) altCheckbox.checked = false;
      } else {
        if (altSwitchLabel) altSwitchLabel.style.display = 'inline-flex';
        if (altCheckbox) {
          altCheckbox.id = `alt_account_${index}`;
          altCheckbox.name = `alt_account_${index}`;
          if (altSwitchLabel) altSwitchLabel.htmlFor = `alt_account_${index}`;
        }
      }

      // Spotify switch
      const spotifyCheckbox = qs("input[name^='no_spotify_']", artist);
      const spotifyLabel = qs('.platform-field[data-platform="spotify"] .availability-switch', artist);
      if (spotifyCheckbox) {
        spotifyCheckbox.id = `no_spotify_${index}`;
        spotifyCheckbox.name = `no_spotify_${index}`;
        if (spotifyLabel) spotifyLabel.htmlFor = `no_spotify_${index}`;
      }

      // Apple switch
      const appleCheckbox = qs("input[name^='no_apple_']", artist);
      const appleLabel = qs('.platform-field[data-platform="apple"] .availability-switch', artist);
      if (appleCheckbox) {
        appleCheckbox.id = `no_apple_${index}`;
        appleCheckbox.name = `no_apple_${index}`;
        if (appleLabel) appleLabel.htmlFor = `no_apple_${index}`;
      }
    });
  };

  const isProfileUrl = (value) => /^https?:\/\//i.test(value.trim());

  const appleJsonp = (url, signal) => new Promise((resolve, reject) => {
    const callbackName = `amethystAppleSearch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timeout = setTimeout(() => finish(new Error('Apple Music search timed out')), 7000);
    const finish = (error, value) => {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => finish(new DOMException('Aborted', 'AbortError'));
    window[callbackName] = (payload) => finish(null, payload);
    script.onerror = () => finish(new Error('Apple Music search failed'));
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${callbackName}`;
    signal?.addEventListener('abort', onAbort, { once: true });
    document.head.append(script);
  });

  const searchAppleJsonp = async (query, signal) => {
    const payload = await appleJsonp(`https://itunes.apple.com/search?media=music&entity=musicArtist&country=US&limit=8&term=${encodeURIComponent(query)}`, signal);
    const seen = new Set();
    const results = (payload.results || []).map((artist) => {
      const id = String(artist.artistId || '');
      const slug = String(artist.artistName || 'artist').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return {
        id,
        name: artist.artistName || '',
        url: artist.artistLinkUrl || artist.artistViewUrl || (id ? `https://music.apple.com/us/artist/${slug}/${id}` : ''),
        image: artist.artworkUrl100 || '',
        subtitle: artist.primaryGenreName || 'Apple Music artist'
      };
    }).filter((artist) => artist.id && artist.name && artist.url && !seen.has(artist.id) && seen.add(artist.id));

    return Promise.all(results.map(async (artist) => {
      try {
        const artworkPayload = await appleJsonp(`https://itunes.apple.com/lookup?id=${encodeURIComponent(artist.id)}&entity=album&limit=1&country=US`, signal);
        const album = (artworkPayload.results || []).find((item) => item.wrapperType === 'collection' && item.artworkUrl100);
        if (album?.artworkUrl100) artist.image = album.artworkUrl100.replace('100x100bb', '240x240bb');
      } catch (error) {
        if (error.name === 'AbortError') throw error;
      }
      return artist;
    }));
  };

  const bindArtistSearch = (field) => {
    const input = qs('[data-artist-search]', field);
    if (!input || input.dataset.searchBound === 'true') return;
    input.dataset.searchBound = 'true';
    const platform = input.dataset.artistSearch;
    const menu = document.createElement('div');
    const note = document.createElement('div');
    const menuId = `artist-search-${Math.random().toString(36).slice(2)}`;
    menu.className = 'artist-search-menu';
    menu.id = menuId;
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    note.className = 'artist-search-note';
    note.hidden = true;
    field.append(menu, note);
    input.setAttribute('aria-controls', menuId);

    let timer;
    let controller;
    let results = [];
    let activeIndex = -1;

    const clearSelected = () => {
      qs('.artist-selected', field)?.remove();
      input.classList.remove('has-selected-artist');
    };

    const close = () => {
      menu.hidden = true;
      note.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    };

    const showNote = (message, isError = false) => {
      menu.hidden = true;
      note.textContent = message;
      note.classList.toggle('error', isError);
      note.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    const selectResult = (result) => {
      input.value = result.url;
      input.dataset.artistId = result.id;
      input.dataset.artistName = result.name;
      clearSelected();
      const selected = document.createElement('div');
      selected.className = 'artist-selected';
      const identity = document.createElement('span');
      identity.className = 'artist-selected-identity';
      const avatar = document.createElement('span');
      avatar.className = 'artist-selected-avatar';
      if (result.image && /^https:\/\//i.test(result.image)) {
        const image = document.createElement('img');
        image.src = result.image;
        image.alt = '';
        avatar.append(image);
      } else {
        avatar.textContent = result.name.slice(0, 1).toUpperCase();
      }
      const name = document.createElement('code');
      name.textContent = result.name;
      identity.append(avatar, name);

      const actions = document.createElement('span');
      actions.className = 'artist-selected-actions';
      const redirect = document.createElement('a');
      redirect.className = 'artist-redirect';
      redirect.href = result.url;
      redirect.target = '_blank';
      redirect.rel = 'noopener noreferrer';
      redirect.textContent = 'Check page';
      redirect.setAttribute('aria-label', `Open ${result.name} on ${platform === 'apple' ? 'Apple Music' : 'Spotify'}`);

      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'artist-change';
      change.textContent = 'Change';
      change.addEventListener('click', () => {
        clearSelected();
        input.value = '';
        delete input.dataset.artistId;
        delete input.dataset.artistName;
        input.focus();
      });
      actions.append(redirect, change);
      selected.append(identity, actions);
      input.after(selected);
      input.classList.add('has-selected-artist');
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };

    const setActive = (index) => {
      const options = qsa('.artist-search-option', menu);
      options.forEach((option) => option.classList.remove('active'));
      if (!options.length) return;
      activeIndex = (index + options.length) % options.length;
      options[activeIndex].classList.add('active');
      options[activeIndex].scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', options[activeIndex].id);
    };

    const render = (items) => {
      results = items;
      menu.replaceChildren();
      note.hidden = true;
      items.forEach((result, index) => {
        const option = document.createElement('div');
        option.className = 'artist-search-option';
        option.id = `${menuId}-option-${index}`;
        option.setAttribute('role', 'option');

        const avatar = document.createElement('span');
        avatar.className = 'artist-search-avatar';
        if (result.image && /^https:\/\//i.test(result.image)) {
          const image = document.createElement('img');
          image.src = result.image;
          image.alt = '';
          image.loading = 'lazy';
          avatar.append(image);
        } else {
          avatar.textContent = result.name.slice(0, 1).toUpperCase();
        }

        const copy = document.createElement('span');
        copy.className = 'artist-search-copy';
        const name = document.createElement('span');
        name.className = 'artist-search-name';
        name.textContent = result.name;
        const meta = document.createElement('span');
        meta.className = 'artist-search-meta';
        meta.textContent = result.subtitle || 'Official artist profile';
        copy.append(name, meta);

        const actions = document.createElement('span');
        actions.className = 'artist-search-actions';
        const redirect = document.createElement('a');
        redirect.className = 'artist-redirect';
        redirect.href = result.url;
        redirect.target = '_blank';
        redirect.rel = 'noopener noreferrer';
        redirect.textContent = 'Check';
        redirect.setAttribute('aria-label', `Open ${result.name} profile in a new tab`);
        redirect.addEventListener('pointerdown', (event) => event.stopPropagation());
        redirect.addEventListener('click', (event) => event.stopPropagation());
        actions.append(redirect);
        option.append(avatar, copy, actions);
        option.addEventListener('pointerdown', (event) => event.preventDefault());
        option.addEventListener('click', () => selectResult(result));
        menu.append(option);
      });
      menu.hidden = !items.length;
      input.setAttribute('aria-expanded', String(Boolean(items.length)));
      if (items.length) setActive(0);
    };

    const search = async (query) => {
      controller?.abort();
      controller = new AbortController();
      showNote(`Searching ${platform === 'apple' ? 'Apple Music' : 'Spotify'}…`);
      try {
        if (platform === 'apple') {
          const appleResults = await searchAppleJsonp(query, controller.signal);
          if (!appleResults.length) {
            showNote('No matching artists found. Check the spelling or paste the profile URL.', true);
            return;
          }
          render(appleResults);
          return;
        }

        const getApiUrl = (endpoint) => {
          if (window.location.protocol === "file:" || !window.location.host) {
            return `https://sigma-label-website.vercel.app${endpoint}`;
          }
          if (VERCEL_BACKEND_URL && window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost") {
            return `${VERCEL_BACKEND_URL.replace(/\/+$/, "")}${endpoint}`;
          }
          return endpoint;
        };

        const response = await fetch(getApiUrl(`/api/${platform}-artists?q=${encodeURIComponent(query)}`), { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) {
          if (payload.code === 'spotify_unconfigured') {
            showNote('Spotify search is awaiting its private API connection. You can still paste a Spotify artist URL.', true);
          } else {
            showNote('Search is temporarily unavailable. You can paste the artist URL manually.', true);
          }
          return;
        }
        if (!payload.results?.length) {
          showNote('No matching artists found. Check the spelling or paste the profile URL.', true);
          return;
        }
        render(payload.results);
      } catch (error) {
        if (error.name !== 'AbortError') showNote('Search is temporarily unavailable. You can paste the artist URL manually.', true);
      }
    };

    input.addEventListener('input', () => {
      clearSelected();
      delete input.dataset.artistId;
      delete input.dataset.artistName;
      clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < 2 || isProfileUrl(query)) {
        controller?.abort();
        close();
        return;
      }
      timer = setTimeout(() => search(query), 320);
    });

    input.addEventListener('keydown', (event) => {
      if (menu.hidden || !results.length) {
        if (event.key === 'Escape') close();
        return;
      }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(activeIndex + 1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(activeIndex - 1); }
      if (event.key === 'Enter') { event.preventDefault(); selectResult(results[activeIndex]); }
      if (event.key === 'Escape') close();
    });

    input.addEventListener('focus', () => {
      if (results.length && !isProfileUrl(input.value)) {
        menu.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!field.contains(event.target)) close();
    });

    field._closeArtistSearch = close;
  };

  const bindArtistControls = (artist) => {
    qsa('.platform-field', artist).forEach(bindArtistSearch);

    // Legal name formatting
    qsa("input[name^='legal_name_']", artist).forEach((legalInput) => {
      legalInput.addEventListener('input', () => handleLegalNameInput(legalInput));
      legalInput.addEventListener('blur', () => handleLegalNameBlur(legalInput));
      legalInput.addEventListener('change', () => handleLegalNameBlur(legalInput));
    });

    // Alt account switch
    qsa('input[data-alt-toggle]', artist).forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const emailInput = qs("input[name^='artist_email_']", artist);
        if (toggle.checked && emailInput) {
          const primaryEmail = qs('#artist_email_0')?.value?.trim();
          if (primaryEmail && !emailInput.value) {
            emailInput.value = primaryEmail;
          }
        }
        validateDuplicateEmails();
      });
    });

    // Email inputs
    qsa("input[name^='artist_email_']", artist).forEach((emailInput) => {
      emailInput.addEventListener('input', validateDuplicateEmails);
      emailInput.addEventListener('blur', validateDuplicateEmails);
    });

    // Platform switches
    qsa('[data-platform-toggle]', artist).forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const platform = toggle.dataset.platformToggle;
        const field = toggle.closest('.platform-field');
        const input = qs(`[data-platform-input="${platform}"]`, field);
        field.classList.toggle('is-unavailable', toggle.checked);
        input.disabled = toggle.checked;
        if (toggle.checked) {
          input.value = '';
          qs('.artist-selected', field)?.remove();
          input.classList.remove('has-selected-artist');
          field._closeArtistSearch?.();
        }
      });
    });

    qs('.remove-artist', artist).addEventListener('click', () => {
      if (qsa('[data-artist]', artistsContainer).length === 1) return;
      artist.remove();
      updateArtistNumbers();
      validateDuplicateEmails();
    });
  };

  qsa('[data-artist]', artistsContainer).forEach(bindArtistControls);
  updateArtistNumbers();

  addArtistButton.addEventListener('click', () => {
    const source = qs('[data-artist]', artistsContainer);
    const artist = source.cloneNode(true);
    artist.querySelectorAll('input').forEach((input) => {
      input.value = '';
      input.checked = false;
      input.disabled = false;
      delete input.dataset.searchBound;
      delete input.dataset.artistId;
      delete input.dataset.artistName;
    });
    artist.querySelectorAll('.artist-search-menu, .artist-search-note, .artist-selected').forEach((element) => element.remove());
    artist.querySelectorAll('.has-selected-artist').forEach((input) => input.classList.remove('has-selected-artist'));
    artist.querySelectorAll('.platform-field').forEach((field) => field.classList.remove('is-unavailable'));
    artistsContainer.appendChild(artist);
    bindArtistControls(artist);
    updateArtistNumbers();
    artist.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });

  // Modal Setup
  const modal = qs('#amethyst-modal');
  const modalTitle = qs('#modal-title');
  const modalMessage = qs('#modal-message');
  const modalClose = qs('#modal-close');
  const modalBackdrop = qs('#modal-backdrop');

  const openModal = (title, message) => {
    if (!modal) return;
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modal.hidden = false;
  };
  const closeModal = () => {
    if (modal) modal.hidden = true;
  };
  modalClose?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);

  // Form Submission Handler
  const submissionForm = qs('#submission-form');
  submissionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitBtn = qs('#submitBtn');
    const submitBtnText = qs('#submitBtnText');
    const originalText = submitBtnText ? submitBtnText.textContent : 'Send Demo to Amethyst';

    const artists = qsa('[data-artist]', artistsContainer).map((block, idx) => {
      const nameInput = qs("input[name^='artist_name_']", block);
      const legalInput = qs("input[name^='legal_name_']", block);
      const emailInput = qs("input[name^='artist_email_']", block);
      const altToggle = qs('input[data-alt-toggle]', block);
      const spotifyInput = qs("[data-platform-input='spotify']", block);
      const appleInput = qs("[data-platform-input='apple']", block);
      const spotifyToggle = qs("[data-platform-toggle='spotify']", block);
      const appleToggle = qs("[data-platform-toggle='apple']", block);

      const rawLegal = legalInput?.value || '';
      const legalName = formatLegalName(rawLegal);
      if (legalInput && legalInput.value !== legalName) legalInput.value = legalName;

      return {
        index: idx + 1,
        artist_name: (nameInput?.value || '').trim(),
        legal_name: legalName,
        email: (emailInput?.value || '').trim(),
        is_alt_account: Boolean(altToggle && altToggle.checked),
        spotify: spotifyToggle?.checked ? null : (spotifyInput?.value || '').trim() || null,
        apple_music: appleToggle?.checked ? null : (appleInput?.value || '').trim() || null
      };
    });

    for (const artist of artists) {
      if (!artist.artist_name) {
        openModal('Missing Artist Name', `Please provide an artist / stage name for Artist #${artist.index}.`);
        return;
      }
      if (!artist.legal_name || !isValidLegalName(artist.legal_name)) {
        openModal(
          'Full Legal Name Required',
          `Please enter a full legal name (First and Last name, e.g. "Daniel Malakhov") for Artist #${artist.index}. Single names are not accepted for distribution agreements.`
        );
        return;
      }
      if (!artist.email) {
        openModal('Missing Artist Email', `Please enter a valid email address for Artist #${artist.index}.`);
        return;
      }
    }

    const emailMap = new Map();
    for (const artist of artists) {
      const email = artist.email.toLowerCase();
      if (!emailMap.has(email)) emailMap.set(email, []);
      emailMap.get(email).push(artist);
    }

    for (const [email, list] of emailMap.entries()) {
      if (list.length > 1) {
        const unallowed = list.find((a, idx) => idx > 0 && !a.is_alt_account);
        if (unallowed) {
          openModal(
            'Duplicate Email Address',
            `Artist #${unallowed.index} is using the same email (${email}) as Artist #${list[0].index}. Each artist must have a unique email address, or turn ON "That's my alt account".`
          );
          return;
        }
      }
    }

    const songTitle = (qs("input[name='song_title']")?.value || '').trim();
    const genre = qs("select[name='genre']")?.value || '';
    const masterLink = (qs("input[name='release_link']")?.value || '').trim();
    const notes = (qs("textarea[name='notes']")?.value || '').trim();
    const releaseDayVal = releaseDay?.value;
    const releaseMonthVal = releaseMonth?.value;
    const releaseYearVal = releaseYear?.value;

    if (!songTitle) {
      openModal('Missing Title', 'Please enter a release or track title.');
      return;
    }
    if (!genre) {
      openModal('Select Genre', 'Please select a primary genre for your release.');
      return;
    }
    if (!releaseDayVal || !releaseMonthVal || !releaseYearVal) {
      openModal('Release Date Required', 'Please select a preferred release date (Day, Month, and Year).');
      return;
    }
    if (!masterLink) {
      openModal('Master Link Required', 'Please provide a downloadable link to your master audio file (Google Drive, Dropbox, SoundCloud private, etc.).');
      return;
    }

    submitBtn.disabled = true;
    if (submitBtnText) submitBtnText.textContent = 'Sending Demo...';

    try {
      if (!amethystSupabase) throw new Error('Supabase client was not initialized.');

      const preferredDate = `${releaseYearVal}-${releaseMonthVal}-${releaseDayVal}`;
      const submissionPayload = {
        release_title: songTitle,
        preferred_release_date: preferredDate,
        release_platform: 'drive',
        release_link: masterLink,
        additional_versions: [genre],
        contact_email: artists[0].email,
        artists: artists,
        primary_artist: artists[0].artist_name,
        notes: notes ? `[Amethyst Web Submission]\nGenre: ${genre}\n\n${notes}` : `[Amethyst Web Submission]\nGenre: ${genre}`,
        status: 'pending',
        submission_type: 'amethyst',
        submitted_from: 'Amethyst Website',
        is_amethyst: true,
        board_position: { source: 'amethyst', is_amethyst: true }
      };

      let { error } = await amethystSupabase.from('submissions').insert(submissionPayload);
      if (error) {
        const errMsg = error.message || '';
        if (errMsg.includes('submission_type') || errMsg.includes('is_amethyst') || error.code === 'PGRST204' || error.code === '42703') {
          const fallbackPayload = { ...submissionPayload };
          delete fallbackPayload.submission_type;
          delete fallbackPayload.is_amethyst;
          const retry = await amethystSupabase.from('submissions').insert(fallbackPayload);
          error = retry.error;
        }
      }
      if (error) throw error;

      openModal(
        'Demo Received',
        `Your track "${songTitle}" has been submitted directly to the Amethyst A&R team! We review submissions regularly and will contact ${artists[0].email} if selected for release.`
      );

      submissionForm.reset();
      const blocks = qsa('[data-artist]', artistsContainer);
      blocks.forEach((b, idx) => { if (idx > 0) b.remove(); });
      updateArtistNumbers();
      updateDays();
    } catch (err) {
      openModal('Submission Failed', 'Something went wrong while sending your submission. Please check your internet connection or try again in a moment.');
    } finally {
      submitBtn.disabled = false;
      if (submitBtnText) submitBtnText.textContent = originalText;
    }
  });

  // WebGL 3D Crystal Simulation
  const canvas = qs('#crystal-canvas');
  const gl = canvas?.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return;

  const vertexShader = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uProjection;
    uniform mat4 uModel;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorld = world.xyz;
      vNormal = mat3(uModel) * aNormal;
      gl_Position = uProjection * world;
    }
  `;
  const fragmentShader = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vWorld;
    uniform vec3 uColor;
    uniform float uWire;
    uniform float uAlpha;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 light = normalize(vec3(-0.4, 0.7, 0.8));
      float diffuse = max(dot(n, light), 0.0);
      float rim = pow(1.0 - abs(n.z), 2.5);
      vec3 deep = vec3(0.13, 0.025, 0.24);
      vec3 color = mix(deep, uColor, 0.2 + diffuse * 0.75) + rim * vec3(0.42, 0.16, 0.72);
      color = mix(color, vec3(0.78, 0.52, 1.0), uWire);
      gl_FragColor = vec4(color, uAlpha);
    }
  `;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(program);
  gl.useProgram(program);

  const locations = {
    position: gl.getAttribLocation(program, 'aPosition'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    projection: gl.getUniformLocation(program, 'uProjection'),
    model: gl.getUniformLocation(program, 'uModel'),
    color: gl.getUniformLocation(program, 'uColor'),
    wire: gl.getUniformLocation(program, 'uWire'),
    alpha: gl.getUniformLocation(program, 'uAlpha')
  };

  const normalize = (v) => {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return v.map((n) => n / length);
  };
  const faceNormal = (a, b, c) => normalize([
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  ]);

  const makeCrystal = (sides = 7) => {
    const top = [0, 1.55, 0];
    const bottom = [0, -1.22, 0];
    const ring = Array.from({ length: sides }, (_, index) => {
      const angle = (index / sides) * Math.PI * 2;
      const radius = index % 2 ? .78 : .92;
      return [Math.cos(angle) * radius, -.08 + (index % 3) * .06, Math.sin(angle) * radius];
    });
    const positions = [];
    const normals = [];
    const lines = [];
    const pushFace = (a, b, c) => {
      const n = faceNormal(a, b, c);
      [a, b, c].forEach((point) => { positions.push(...point); normals.push(...n); });
    };
    for (let i = 0; i < sides; i += 1) {
      const next = (i + 1) % sides;
      pushFace(top, ring[i], ring[next]);
      pushFace(bottom, ring[next], ring[i]);
      lines.push(...top, ...ring[i], ...bottom, ...ring[i], ...ring[i], ...ring[next]);
    }
    const lineNormals = new Array(lines.length).fill(0);
    for (let i = 2; i < lineNormals.length; i += 3) lineNormals[i] = 1;
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), lines: new Float32Array(lines), lineNormals: new Float32Array(lineNormals) };
  };

  const geometry = makeCrystal(7);
  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const lineBuffer = gl.createBuffer();
  const lineNormalBuffer = gl.createBuffer();
  const bindAttribute = (buffer, location, data) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  };
  bindAttribute(positionBuffer, locations.position, geometry.positions);
  bindAttribute(normalBuffer, locations.normal, geometry.normals);

  const multiply = (a, b) => {
    const out = new Float32Array(16);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
      }
    }
    return out;
  };
  const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const translate = (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
  const scale = (x, y, z) => new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]);
  const rotateX = (a) => { const c=Math.cos(a), s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); };
  const rotateY = (a) => { const c=Math.cos(a), s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); };
  const rotateZ = (a) => { const c=Math.cos(a), s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); };
  const perspective = (fov, aspect, near, far) => {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  };

  const crystals = [
    { x: -4.4, y: 1.9, z: -2.2, s: 1.15, speed: .19, drift: .9, hue: [0.54, .22, .92] },
    { x: 4.2, y: -1.6, z: -2.8, s: .92, speed: -.24, drift: 1.3, hue: [.63, .31, 1.0] },
    { x: 3.1, y: 2.6, z: -4.6, s: .48, speed: .31, drift: 1.8, hue: [.39, .12, .78] },
    { x: -3.2, y: -2.9, z: -4.1, s: .58, speed: -.27, drift: 1.6, hue: [.72, .43, 1.0] },
    { x: .2, y: -3.7, z: -5.2, s: .38, speed: .35, drift: 2.1, hue: [.47, .18, .87] }
  ];

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let projection = identity();
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.7);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    projection = perspective(Math.PI / 3.15, innerWidth / innerHeight, .1, 30);
  };
  addEventListener('resize', resize, { passive: true });
  resize();

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const render = (timeMs) => {
    const time = timeMs * .001;
    const scroll = scrollY / Math.max(document.body.scrollHeight - innerHeight, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(locations.projection, false, projection);

    crystals.forEach((crystal, index) => {
      const motion = reducedMotion ? 0 : time;
      const narrow = innerWidth < 720;
      const xScale = narrow ? .72 : 1;
      const verticalTravel = (scroll - .5) * (index % 2 ? -2.8 : 3.4);
      let model = translate(
        (crystal.x + pointerX * .22 * crystal.drift) * xScale,
        crystal.y + Math.sin(motion * .52 + index) * .28 + verticalTravel - pointerY * .12,
        crystal.z - 7.2
      );
      model = multiply(model, rotateY(motion * crystal.speed + pointerX * .16 + scroll * 1.8));
      model = multiply(model, rotateX(motion * crystal.speed * .7 - pointerY * .1));
      model = multiply(model, rotateZ(index * .43 + Math.sin(motion * .22) * .18));
      model = multiply(model, scale(crystal.s, crystal.s * 1.15, crystal.s));
      gl.uniformMatrix4fv(locations.model, false, model);
      gl.uniform3fv(locations.color, crystal.hue);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(locations.wire, 0);
      gl.uniform1f(locations.alpha, .42);
      gl.drawArrays(gl.TRIANGLES, 0, geometry.positions.length / 3);

      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.lines, gl.STATIC_DRAW);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineNormalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.lineNormals, gl.STATIC_DRAW);
      gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(locations.wire, 1);
      gl.uniform1f(locations.alpha, .52);
      gl.drawArrays(gl.LINES, 0, geometry.lines.length / 3);
    });
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
})();
