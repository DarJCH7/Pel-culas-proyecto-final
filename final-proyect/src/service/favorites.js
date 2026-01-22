import { supabase } from "../supabaseClient.js";

export class FavoritesService {

    static async addFavorite(movie, userName) {
        const movieData = {
            id: movie.id,
            title: movie.title || movie.name,
            poster_path: movie.poster_path,
            release_date: movie.release_date || movie.first_air_date,
            media_type: movie.media_type || 'movie',
            scanned_by: userName
        };

        const { error } = await supabase
            .from('favorites')
            .upsert(movieData, { onConflict: 'id' });

        return !error;
    }

    static async removeFavorite(id) {
        const { error } = await supabase
            .from('favorites')
            .delete()
            .eq('id', id);

        return !error;
    }

    static async fetchFavorites() {
        const { data, error } = await supabase
            .from('favorites')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return [];
        return data;
    }

    static async isFavorite(id) {
        const { data, error } = await supabase
            .from('favorites')
            .select('id')
            .eq('id', id)
            .single();

        return !!data && !error;
    }
}