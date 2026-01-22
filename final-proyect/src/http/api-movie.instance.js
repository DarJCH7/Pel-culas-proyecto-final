import axios from "axios";
import {API_KEY} from "../constants/credentials.js";
import {BASE_URL} from "../constants/base-url.js";

export const movieInstance = axios.create({
    baseURL: BASE_URL,
    headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
    },
});
