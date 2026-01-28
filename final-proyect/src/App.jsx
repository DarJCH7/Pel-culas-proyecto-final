import { useEffect, useState, useRef } from 'react';
import { ApiMovie } from "./service/api-movie.js";
import { buildUrlImage } from "./utils/buildUrlImage.js";
import Modal from "./components/modal.jsx";
import { generateQr } from "./helper/generateQr.js";
import { supabase } from "./supabaseClient.js";
import { FavoritesService } from "./service/favorites.js";
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay, EffectFade } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/free-mode';
import 'swiper/css/pagination';
import 'swiper/css/autoplay';
import 'swiper/css/effect-fade';

const CATEGORIES = [
    { id: 'popular', name: "Tendencias" },
    { id: 28, name: "Acción" },
    { id: 12, name: "Aventura" },
    { id: 16, name: "Animación" },
    { id: 35, name: "Comedia" },
    { id: 80, name: "Crimen" },
    { id: 99, name: "Documental" },
    { id: 18, name: "Drama" },
    { id: 10751, name: "Familia" },
    { id: 14, name: "Fantasía" },
    { id: 36, name: "Historia" },
    { id: 27, name: "Terror" },
    { id: 878, name: "Ciencia Ficción" },
];

const EXTENDED_CATEGORIES = [...CATEGORIES, ...CATEGORIES, ...CATEGORIES];

const HISTORY_FILTERS = [
    { id: 'all', name: "Todos" },
    { id: 'movie', name: "Películas" },
    { id: 'tv', name: "Series" },
];

const CURRENT_USER = "Usuario";

function App() {
    const [movies, setMovies] = useState([]);
    const [heroMovies, setHeroMovies] = useState([]);
    const [isOpenModal, setIsOpenModal] = useState(false);
    const [qrCode, setQrCode] = useState(null);
    const [selected, setSelected] = useState(null);
    const [trailerKey, setTrailerKey] = useState(null);
    const [activeCategory, setActiveCategory] = useState('popular');
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [isFavorite, setIsFavorite] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [sortOrder, setSortOrder] = useState('default');
    const [viewMode, setViewMode] = useState('grid');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const [activeTab, setActiveTab] = useState('inicio');
    const [contentType, setContentType] = useState('movie');
    const [historyFilter, setHistoryFilter] = useState('all');
    const searchInputRef = useRef(null);

    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const loadFavorites = async () => {
        const favorites = await FavoritesService.fetchFavorites();
        setMovies(favorites);
    }

    useEffect(() => {
        const element = document.documentElement;
        const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

        function applyTheme() {
            if (theme === 'dark' || (theme === 'system' && darkQuery.matches)) {
                element.classList.add('dark');
            } else {
                element.classList.remove('dark');
            }
        }

        applyTheme();
        localStorage.setItem('theme', theme);

        if (theme === 'system') {
            darkQuery.addEventListener('change', applyTheme);
            return () => darkQuery.removeEventListener('change', applyTheme);
        }
    }, [theme]);

    useEffect(() => {
        const fetchHeroContent = async () => {
            try {
                const movies = await ApiMovie.getPopularMovies(1);
                const tv = await ApiMovie.getPopularTV(1);

                const combined = [...movies.results.slice(0, 4), ...tv.results.slice(0, 3)]
                    .sort(() => 0.5 - Math.random())
                    .map(item => ({
                        ...item,
                        title: item.title || item.name,
                        media_type: item.title ? 'movie' : 'tv'
                    }));

                setHeroMovies(combined);
            } catch (error) {
                console.error("No se puede hacer fetch:", error);
            }
        };

        fetchHeroContent();
        fetchMovies('mixed', 'popular', 1);
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel('realtime-history')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'history',
                },
                (payload) => {
                    if (activeTab === 'historial') {
                        setMovies((prevMovies) => [payload.new, ...prevMovies]);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'lista')
            loadFavorites()
    }, [activeTab]);

    const addToHistory = async (movie) => {
        const type = movie.media_type || contentType;

        const movieData = {
            id: movie.id,
            title: movie.title || movie.name,
            poster_path: movie.poster_path,
            release_date: movie.release_date || movie.first_air_date,
            media_type: type,
            scanned_by: CURRENT_USER
        };

        const { error } = await supabase
            .from('history')
            .upsert(movieData, { onConflict: 'id' });

        if (error) console.error('Error guardando historial:', error);
    };

    const fetchHistory = async () => {
        const { data, error } = await supabase
            .from('history')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error('Error cargando historial:', error);
        else setMovies(data || []);
    };

    const fetchFavorites = async () => {
        const { data, error } = await supabase
            .from('favorites')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error("Error cargando favoritos", error);
        else setMovies(data || []);
    };

    const toggleFavorite = async () => {
        if (isFavorite) {
            const { error } = await supabase.from('favorites').delete().eq('id', selected.id);
            if (!error) {
                setIsFavorite(false);
                if (activeTab === 'lista') fetchFavorites();
            }
        } else {
            const type = selected.media_type || (selected.name ? 'tv' : 'movie');
            const { error } = await supabase.from('favorites').insert({
                id: selected.id,
                title: selected.title || selected.name,
                poster_path: selected.poster_path,
                release_date: selected.release_date || selected.first_air_date,
                media_type: type,
                user_name: CURRENT_USER
            });
            if (!error) {
                setIsFavorite(true);
            } else {
                console.error("Error al guardar favorito:", error);
            }
        }
    };

    const fetchMovies = async (type, categoryId, pageNum = 1) => {
        try {
            if (isSearching) return;

            let results = [];

            if (type === 'mixed' && categoryId === 'popular') {
                const movies = await ApiMovie.getPopularMovies(pageNum);
                const tv = await ApiMovie.getPopularTV(pageNum);

                const normalizedMovies = (movies.results || []).map(m => ({ ...m, media_type: 'movie', title: m.title || m.name, release_date: m.release_date || m.first_air_date }));
                const normalizedTV = (tv.results || []).map(t => ({ ...t, media_type: 'tv', title: t.title || t.name, release_date: t.release_date || t.first_air_date }));

                results = [...normalizedMovies, ...normalizedTV];

            } else if (categoryId === 'popular') {
                let response;
                if (type === 'movie') {
                    response = await ApiMovie.getPopularMovies(pageNum);
                } else {
                    response = ApiMovie.getPopularTV ? await ApiMovie.getPopularTV(pageNum) : await ApiMovie.getPopularMovies(pageNum);
                }
                results = (response.results || []).map(item => ({
                    ...item,
                    title: item.title || item.name,
                    release_date: item.release_date || item.first_air_date,
                    media_type: type
                }));
            } else {
                const response = await ApiMovie.getMoviesByGenre(categoryId, pageNum);
                results = (response.results || []).map(item => ({
                    ...item,
                    title: item.title || item.name,
                    release_date: item.release_date || item.first_air_date,
                    media_type: type === 'mixed' ? 'movie' : type
                }));
            }

            if (results.length === 0) {
                if (pageNum > 1) setHasMore(false);
                return;
            } else {
                setHasMore(true);
            }

            if (pageNum === 1) {
                setMovies(results);
            } else {
                setMovies(prev => {
                    const uniqueKey = (m) => `${m.id}-${m.media_type || 'movie'}`;
                    const existingKeys = new Set(prev.map(m => uniqueKey(m)));
                    const newUniqueMovies = results.filter(m => !existingKeys.has(uniqueKey(m)));

                    return [...prev, ...newUniqueMovies];
                });
            }

            setActiveCategory(categoryId);
            setPage(pageNum);

        } catch (error) {
            console.error("Error cargando", error);
            setHasMore(false);
        }
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        let type = contentType;
        if (activeTab === 'inicio') type = 'mixed';
        fetchMovies(type, activeCategory, nextPage);
    };

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    const handleNavClick = (tabId) => {

        setActiveTab(tabId);
        setSearchTerm("");
        setIsSearching(false);
        setActiveCategory('popular');
        setHistoryFilter('all');
        setIsMobileMenuOpen(false);
        setSortOrder('default');
        setViewMode('grid');
        setPage(1);
        setHasMore(true);

        if (tabId === 'inicio') {
            setContentType('movie');
            fetchMovies('mixed', 'popular', 1);

        } else if (tabId === 'peliculas') {
            setContentType('movie');
            fetchMovies('movie', 'popular', 1);

        } else if (tabId === 'series') {
            setContentType('tv');
            fetchMovies('tv', 'popular', 1);

        } else if (tabId === 'historial') {
            fetchHistory();

        } else if (tabId === 'lista') {
            fetchFavorites();

        } else {
            setMovies([]);
        }
    };

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchTerm(query);

        if (query.length > 2) {
            setIsSearching(true);
            try {
                const data = await ApiMovie.searchMulti(query);
                let results = [];

                data.results.forEach(item => {
                    const isMovie = item.media_type === 'movie';
                    const isTV = item.media_type === 'tv';
                    const isPerson = item.media_type === 'person';

                    if (activeTab === 'inicio' || activeTab === 'historial' || activeTab === 'lista') {
                        if (isMovie || isTV) results.push(item);
                        if (isPerson && item.known_for) results.push(...item.known_for);
                    } else if (activeTab === 'peliculas') {
                        if (isMovie) results.push(item);
                    } else if (activeTab === 'series') {
                        if (isTV) results.push(item);
                    }
                });

                const uniqueMovies = Array.from(new Set(results.map(a => a.id)))
                    .map(id => {
                        const item = results.find(a => a.id === id);
                        return {
                            ...item,
                            title: item.title || item.name,
                            release_date: item.release_date || item.first_air_date
                        };
                    });

                setMovies(uniqueMovies);

            } catch (error) {
                console.error("Error buscando", error);
            }
        } else if (query.length === 0) {
            setIsSearching(false);
            if (activeTab === 'historial') {
                fetchHistory();
            } else if (activeTab === 'lista') {
                fetchFavorites();
            } else if (activeTab === 'inicio') {
                fetchMovies('mixed', 'popular', 1);
            } else {
                const type = activeTab === 'series' ? 'tv' : 'movie';
                fetchMovies(type, 'popular', 1);
            }
        }
    };

    const toggleSearch = () => {
        setIsSearchExpanded(!isSearchExpanded);
        if (!isSearchExpanded && searchInputRef.current) {
            setTimeout(() => {
                searchInputRef.current.focus();
            }, 100);
        }
    };

    const openModalWithQr = async (movie) => {
        addToHistory(movie);

        setSelected(movie);
        setIsOpenModal(true);
        setQrCode(null);
        setTrailerKey(null);

        const { data: favData } = await supabase.from('favorites').select('id').eq('id', movie.id).single();
        setIsFavorite(!!favData);

        const typePath = (movie.media_type === 'tv' || contentType === 'tv') ? 'tv' : 'movie';

        const qr = await generateQr(`https://www.themoviedb.org/${typePath}/${movie.id}`);
        setQrCode(qr);

        try {
            const videoData = (movie.media_type === 'tv' || contentType === 'tv')
                ? await ApiMovie.getTvVideos(movie.id)
                : await ApiMovie.getMovieVideos(movie.id);

            const videos = videoData.results || [];

            const youtubeVideos = videos.filter(v => v.site === "YouTube");
            const originalLang = movie.original_language;

            const findExact = (type, lang, region) => youtubeVideos.find(v => v.type === type && v.iso_639_1 === lang && v.iso_3166_1 === region);
            const findLang = (type, lang) => youtubeVideos.find(v => v.type === type && v.iso_639_1 === lang);

            let bestVideo = null;

            if (!bestVideo) bestVideo = findExact("Trailer", "es", "MX");
            if (!bestVideo) bestVideo = findExact("Trailer", "es", "ES");
            if (!bestVideo) bestVideo = findLang("Trailer", "es");
            if (!bestVideo) bestVideo = findLang("Trailer", "en");
            if (!bestVideo && originalLang !== "en" && originalLang !== "es") bestVideo = findLang("Trailer", originalLang);

            if (!bestVideo) bestVideo = findExact("Teaser", "es", "MX");
            if (!bestVideo) bestVideo = findExact("Teaser", "es", "ES");
            if (!bestVideo) bestVideo = findLang("Teaser", "es");
            if (!bestVideo) bestVideo = findLang("Teaser", "en");
            if (!bestVideo && originalLang !== "en" && originalLang !== "es") bestVideo = findLang("Teaser", originalLang);

            if (bestVideo) {
                setTrailerKey(bestVideo.key);
            }
        } catch (error) {
            console.error("Error buscando trailer:", error);
        }
    };

    const getProcessedMovies = () => {
        let filtered = movies;

        if (activeTab === 'historial' && historyFilter !== 'all') {
            filtered = movies.filter(m => m.media_type === historyFilter);
        }

        if (sortOrder === 'default') {
            return filtered;
        }

        return [...filtered].sort((a, b) => {
            const titleA = (a.title || "").toLowerCase();
            const titleB = (b.title || "").toLowerCase();
            if (sortOrder === 'asc') {
                return titleA.localeCompare(titleB);
            } else {
                return titleB.localeCompare(titleA);
            }
        });
    };

    const displayedMovies = getProcessedMovies();

    const MovieCard = ({ movie }) => (
        <div
            onClick={() => openModalWithQr(movie)}
            className="cursor-pointer relative bg-white dark:bg-neutral-800 rounded-xl overflow-hidden shadow-lg border border-transparent transition-all duration-300 hover:scale-105 hover:ring-4 hover:ring-blue-500/50 dark:hover:ring-white hover:z-20 hover:shadow-2xl group h-full select-none"
        >
            <div className="relative overflow-hidden aspect-[2/3]">
                <img
                    src={buildUrlImage(movie.poster_path)}
                    alt={movie.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:brightness-50"
                    loading="lazy"
                />
                <div className="absolute inset-0 flex items-center justify-center p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <h3 className="text-white text-center font-black text-xl uppercase drop-shadow-lg leading-tight tracking-wider">
                        {movie.title}
                    </h3>
                </div>

                {activeTab === 'historial' && (
                    <div className="absolute bottom-0 w-full bg-black/80 backdrop-blur-sm py-1 px-2">
                        <div className="flex items-center gap-1.5 justify-center">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 p-[1px]">
                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${movie.scanned_by || 'Unknown'}`} className="w-full h-full rounded-full bg-black" />
                            </div>
                            <span className="text-[10px] text-white/90 font-medium">
                                Escaneado por: {movie.scanned_by || 'Desconocido' }
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {activeTab !== 'historial' && (
                <div className="p-4 relative transition-opacity duration-300 group-hover:opacity-0">
                    <p className="text-sm font-bold line-clamp-1 text-gray-800 dark:text-gray-200">
                        {movie.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}
                    </p>
                </div>
            )}
        </div>
    );

    const navItems = [
        { id: 'inicio', name: "INICIO", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
        { id: 'peliculas', name: "PELÍCULAS", icon: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 19.814 6 20.25v1.125m-3.375 0h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125m17.25 0a1.125 1.125 0 00-1.125-1.125m-1.5 0v1.125c0 .436.504.75 1.125.75h1.5m-3 0h-9m0 0v-1.125c0-.436-.504-.75-1.125-.75h-1.5m11.25 0a1.125 1.125 0 00-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" },
        { id: 'series', name: "SERIES", icon: "M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" },
        { id: 'lista', name: "MI LISTA", icon: "M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" },
        { id: 'historial', name: "HISTORIAL", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    ];

    return (
        <>
            <div className="min-h-screen bg-gray-100 dark:bg-neutral-900 text-gray-900 dark:text-white font-sans transition-colors duration-300">

                <header className="sticky top-0 z-50 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 shadow-lg">
                    <div className="max-w-[1920px] mx-auto px-6 h-20 flex items-center justify-between">

                        <div className="flex items-center gap-4 lg:hidden">
                            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors text-gray-600 dark:text-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 group cursor-pointer">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 p-[2px] shadow-lg shadow-blue-500/20">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${CURRENT_USER}`} alt="User" className="w-full h-full rounded-full bg-black" />
                                </div>
                                <span className="hidden md:block text-sm font-bold text-gray-800 dark:text-gray-200 group-hover:text-blue-500 transition-colors">
                                    {CURRENT_USER}
                                </span>
                            </div>

                            <div className="relative">
                                <button
                                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors text-gray-600 dark:text-gray-300"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.581-.495.644-.869l.214-1.281z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>

                                {isSettingsOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-gray-100 dark:border-white/10 overflow-hidden fade-in z-50">
                                        <div className="px-4 py-2 border-b border-gray-100 dark:border-white/10">
                                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Tema</p>
                                        </div>
                                        <button
                                            onClick={() => { setTheme('light'); setIsSettingsOpen(false); }}
                                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-neutral-700 ${theme === 'light' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-200'}`}
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                            Claro
                                        </button>
                                        <button
                                            onClick={() => { setTheme('dark'); setIsSettingsOpen(false); }}
                                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-neutral-700 ${theme === 'dark' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-200'}`}
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                                            Oscuro
                                        </button>
                                        <button
                                            onClick={() => { setTheme('system'); setIsSettingsOpen(false); }}
                                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-neutral-700 ${theme === 'system' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-200'}`}
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            Automático
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <nav className="hidden lg:flex items-center gap-8 mr-4">
                            {navItems.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleNavClick(item.id)}
                                    className={`flex items-center gap-2 group cursor-pointer bg-transparent border-none`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className={`w-4 h-4 transition-colors mb-0.5 ${activeTab === item.id ? "text-blue-500" : "text-neutral-400 group-hover:text-gray-800 dark:group-hover:text-white"}`}>
                                        <path d={item.icon} />
                                    </svg>
                                    <span className={`text-[13px] font-bold tracking-widest transition-colors relative after:content-[''] after:absolute after:-bottom-1.5 after:left-0 after:h-[2px] after:bg-blue-500 after:transition-all after:duration-300 ${activeTab === item.id ? "text-gray-900 dark:text-white after:w-full" : "text-neutral-400 group-hover:text-gray-800 dark:group-hover:text-white after:w-0 group-hover:after:w-full"}`}>
                                        {item.name}
                                    </span>
                                </button>
                            ))}
                        </nav>

                        <div className={`relative flex items-center bg-gray-100 dark:bg-neutral-800 border border-transparent focus-within:border-gray-300 dark:focus-within:border-white/50 focus-within:bg-white dark:focus-within:bg-neutral-900 transition-all duration-300 rounded-full overflow-hidden ${isSearchExpanded || isSearching || searchTerm ? "w-64 bg-white dark:bg-neutral-900 border-gray-300 dark:border-white/50" : "w-10 hover:bg-gray-200 dark:hover:bg-neutral-700"}`}>
                            <div className="pl-3 py-2 cursor-pointer" onClick={toggleSearch}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-gray-500 dark:text-gray-300">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                            </div>
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={handleSearch}
                                placeholder="Buscar..."
                                className={`bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ml-2 w-full h-full py-2 pr-4 transition-opacity duration-200 ${isSearchExpanded || isSearching || searchTerm ? "opacity-100" : "opacity-0 focus:opacity-100"}`}
                            />
                        </div>

                    </div>
                </header>

                {isMobileMenuOpen && (
                    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg lg:hidden flex flex-col p-6 transition-all fade-in">
                        <div className="flex justify-end mb-8">
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-white p-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <nav className="flex flex-col gap-6">
                            {navItems.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleNavClick(item.id)}
                                    className={`flex items-center gap-4 text-xl font-bold transition-colors ${activeTab === item.id ? "text-blue-500" : "text-white"}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
                                        <path d={item.icon} />
                                    </svg>
                                    {item.name}
                                </button>
                            ))}
                        </nav>
                    </div>
                )}

                <main className="pb-8">

                    {!isSearching && activeTab === 'inicio' && heroMovies.length > 0 && (
                        <Swiper
                            modules={[Pagination, Autoplay, EffectFade]}
                            effect={'fade'}
                            pagination={{ clickable: true }}
                            autoplay={{ delay: 5000, disableOnInteraction: false }}
                            loop={true}
                            className="w-full h-[50vh] md:h-[70vh] mb-8"
                        >
                            {heroMovies.map((movie) => (
                                <SwiperSlide key={movie.id}>
                                    <div className="relative w-full h-full" onClick={() => openModalWithQr(movie)}>
                                        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent z-10" />
                                        <img
                                            src={buildUrlImage(movie.backdrop_path, 'original')}
                                            alt={movie.title}
                                            className="w-full h-full object-cover object-top"
                                        />
                                        <div className="absolute inset-0 flex items-center z-20 p-6 md:p-16">
                                            <div className="max-w-xl text-white fade-in-up">
                                                <h1 className="text-3xl md:text-5xl font-black mb-4 drop-shadow-2xl leading-tight">
                                                    {movie.title}
                                                </h1>
                                                <p className="text-sm md:text-base line-clamp-3 drop-shadow-lg mb-6 text-gray-300 font-medium">
                                                    {movie.overview}
                                                </p>
                                                <button className="bg-white text-black px-6 py-3 rounded-md font-bold hover:bg-gray-200 transition-colors flex items-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                                    </svg>
                                                    Ver ahora
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </SwiperSlide>
                            ))}
                        </Swiper>
                    )}

                    <div className="max-w-[1920px] mx-auto px-6">
                        {(activeTab === 'lista') && !isSearching ? (
                            <>
                                <div className="flex flex-col items-center justify-center mb-8 text-center">
                                    <h2 className="text-3xl font-bold text-gray-400 dark:text-neutral-500 mb-4">
                                        Mi Lista
                                    </h2>
                                    <p className="text-gray-500 dark:text-neutral-400">
                                        {movies.length > 0 ? `Tienes ${movies.length} favorito${movies.length !== 1 ? 's' : ''}` : "Aún no has agregado favoritos."}
                                    </p>
                                </div>

                                {movies.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                                        {movies.map((movie) => (
                                            <MovieCard key={movie.id} movie={movie} />
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {!isSearching && activeTab !== 'inicio' && (
                                    <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 fade-in z-10">

                                        <div className="relative group/nav max-w-full overflow-hidden flex-1 px-10">
                                            {activeTab === 'historial' ? (
                                                <div className="inline-flex items-center bg-white/80 dark:bg-neutral-950/80 p-3 rounded-full border border-gray-200 dark:border-white/10 shadow-xl backdrop-blur-xl">
                                                    {HISTORY_FILTERS.map((filter) => (
                                                        <button
                                                            key={filter.id}
                                                            onClick={() => setHistoryFilter(filter.id)}
                                                            className={`mx-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 whitespace-nowrap text-center relative
                                                                ${historyFilter === filter.id
                                                                ? "bg-blue-600 text-white shadow-lg"
                                                                : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
                                                            }`}
                                                        >
                                                            {filter.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <div className="swiper-button-prev-custom absolute left-[-40px] top-1/2 -translate-y-1/2 z-20 cursor-pointer p-2 bg-white/80 dark:bg-neutral-800 rounded-full shadow-lg hover:scale-110 transition-transform">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-gray-800 dark:text-white">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                                        </svg>
                                                    </div>

                                                    <Swiper
                                                        modules={[Navigation]}
                                                        slidesPerView={'auto'}
                                                        spaceBetween={10}
                                                        loop={true}
                                                        navigation={{
                                                            prevEl: '.swiper-button-prev-custom',
                                                            nextEl: '.swiper-button-next-custom',
                                                        }}
                                                        className="w-full"
                                                    >
                                                        {EXTENDED_CATEGORIES.map((category, index) => (
                                                            <SwiperSlide key={`${category.id}-${index}`} className="!w-auto">
                                                                <button
                                                                    onClick={() => fetchMovies(contentType, category.id)}
                                                                    className={`px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 whitespace-nowrap text-center
                                                                    ${activeCategory === category.id
                                                                        ? "bg-gray-900 dark:bg-white text-white dark:text-black font-extrabold scale-105 shadow-xl"
                                                                        : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white border border-transparent"
                                                                    }`}
                                                                >
                                                                    {category.name}
                                                                </button>
                                                            </SwiperSlide>
                                                        ))}
                                                    </Swiper>

                                                    <div className="swiper-button-next-custom absolute right-[-40px] top-1/2 -translate-y-1/2 z-20 cursor-pointer p-2 bg-white/80 dark:bg-neutral-800 rounded-full shadow-lg hover:scale-110 transition-transform">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-gray-800 dark:text-white">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 bg-white/80 dark:bg-neutral-950/80 p-2 rounded-full border border-gray-200 dark:border-white/10 shadow-xl backdrop-blur-xl">

                                            <button
                                                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-600 dark:text-gray-300 flex items-center gap-2 px-3 text-xs font-bold"
                                            >
                                                {sortOrder === 'desc' ? 'Z-A' : 'A-Z'}
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                                                </svg>
                                            </button>

                                            <div className="w-px h-4 bg-gray-300 dark:bg-gray-700"></div>

                                            <button
                                                onClick={() => setViewMode('grid')}
                                                className={`p-2 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                                                </svg>
                                            </button>

                                            <button
                                                onClick={() => setViewMode('table')}
                                                className={`p-2 rounded-full transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <section className="min-h-[50vh]">

                                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-white">
                                        {isSearching
                                            ? (movies.length > 0 && movies[0].id !== 999999
                                                ? `Resultados para: "${searchTerm}"`
                                                : <span className="text-gray-500 dark:text-gray-400 font-normal">No encontramos nada para "<span className="text-black dark:text-white font-bold">{searchTerm}</span>", prueba con esto:</span>)
                                            : (
                                                <>
                                                    <span className="w-1 h-6 bg-blue-600 rounded-full block shadow-sm"></span>
                                                    {activeTab === 'historial'
                                                        ? "Historial de visualización"
                                                        : activeTab === 'lista'
                                                            ? "Mi Lista"
                                                            : activeTab === 'inicio'
                                                                ? "Explora todo el contenido"
                                                                : activeCategory === 'popular'
                                                                    ? (activeTab === 'series' ? "Tendencias en Series" : "Tendencias Globales")
                                                                    : CATEGORIES.find(c => c.id === activeCategory)?.name}
                                                </>
                                            )
                                        }
                                    </h2>

                                    {displayedMovies.length === 0 && !isSearching && activeTab !== 'inicio' && (
                                        <div className="text-center text-gray-500 py-20 bg-gray-50 dark:bg-neutral-800/20 rounded-xl border border-gray-200 dark:border-white/5">
                                            <p className="text-lg">
                                                {activeTab === 'lista' ? "Aún no has agregado favoritos." : "No hay registros."}
                                            </p>
                                        </div>
                                    )}

                                    {viewMode === 'table' ? (
                                        <div className="overflow-x-auto rounded-xl shadow-lg border border-gray-200 dark:border-white/10">
                                            <table className="w-full text-left text-gray-500 dark:text-gray-400">
                                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-neutral-800 dark:text-gray-400">
                                                <tr>
                                                    <th className="px-6 py-4">Poster</th>
                                                    <th className="px-6 py-4">Título</th>
                                                    <th className="px-6 py-4">Año</th>
                                                    <th className="px-6 py-4">Tipo</th>
                                                    <th className="px-6 py-4">Acción</th>
                                                </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                                                {displayedMovies.map((movie) => (
                                                    <tr key={movie.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer" onClick={() => openModalWithQr(movie)}>
                                                        <td className="px-6 py-4">
                                                            <img src={buildUrlImage(movie.poster_path)} className="w-12 h-16 object-cover rounded-md shadow-sm" alt="" />
                                                        </td>
                                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{movie.title}</td>
                                                        <td className="px-6 py-4">{movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}</td>
                                                        <td className="px-6 py-4 uppercase text-xs font-bold tracking-wider">{movie.media_type === 'tv' ? 'Serie' : 'Película'}</td>
                                                        <td className="px-6 py-4">
                                                            <button className="text-blue-600 hover:underline text-sm font-bold">Ver Detalles</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
                                            {displayedMovies.map((movie) => (
                                                <MovieCard key={movie.id} movie={movie} />
                                            ))}
                                        </div>
                                    )}
                                </section>

                                {!isSearching && activeTab !== 'lista' && activeTab !== 'historial' && (
                                    <div className="flex justify-center mt-12 pb-8">
                                        {hasMore ? (
                                            <button
                                                onClick={handleLoadMore}
                                                className="px-8 py-3 rounded-full bg-white dark:bg-neutral-800 text-black dark:text-white font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2 border border-gray-200 dark:border-white/10"
                                            >
                                                Cargar más contenido
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 animate-bounce">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                </svg>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={scrollToTop}
                                                className="px-8 py-3 rounded-full bg-gray-200 dark:bg-neutral-800 text-gray-600 dark:text-gray-400 font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2 border border-gray-300 dark:border-white/10"
                                            >
                                                Volver al inicio
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </main>
            </div>

            <Modal
                isOpen={isOpenModal}
                onClose={() => setIsOpenModal(false)}
                qr={qrCode}
                movie={selected}
                trailerKey={trailerKey}
                onToggleFavorite={toggleFavorite}
                isFavorite={isFavorite}
            />
        </>
    );
}

export default App;