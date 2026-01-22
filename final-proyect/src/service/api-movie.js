import {movieInstance} from "../http/api-movie.instance.js";

export class ApiMovie {

    static async getPopularMovies(page = 1) {
        const response = await movieInstance.get('/movie/popular', {
            params: {
                language: "es-ES",
                page: page
            }
        });
        return response.data;
    }

    static async getPopularTV(page = 1) {
        const response = await movieInstance.get('/tv/popular', {
            params: {
                language: "es-ES",
                page: page
            }
        });
        return response.data;
    }

    static async getMovieVideos(movieId) {
        const response = await movieInstance.get(`/movie/${movieId}/videos`, {
            params: {
                include_video_language: "es,en"
            }
        });
        return response.data;
    }

    static async getTvVideos(tvId) {
        const response = await movieInstance.get(`/tv/${tvId}/videos`, {
            params: {
                include_video_language: "es,en"
            }
        });
        return response.data;
    }

    static async getMoviesByGenre(genreId, page = 1) {
        const response = await movieInstance.get('/discover/movie', {
            params: {
                language: "es-ES",
                with_genres: genreId,
                sort_by: "popularity.desc",
                page: page
            }
        });
        return response.data;
    }

    static async getTVByGenre(genreId, page = 1) {
        const response = await movieInstance.get('/discover/tv', {
            params: {
                language: "es-ES",
                with_genres: genreId,
                sort_by: "popularity.desc",
                page: page
            }
        });
        return response.data;
    }

    static async searchMulti(query, page = 1) {
        const response = await movieInstance.get('/search/multi', {
            params: {
                query: query,
                language: "es-ES",
                include_adult: false,
                page: page
            }
        });
        return response.data;
    }
}