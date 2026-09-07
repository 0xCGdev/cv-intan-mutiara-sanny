import { state, setToken } from "./state.js";

const API_URL = "https://script.google.com/macros/s/AKfycbxOfDBN9Dqkk3WbK2ChSmdCKpQcSfqvqhDsluMYesfMZoFhOr-vcoLDxISHQGZ_kH45SA/exec";

export async function api(action, data = {}, useToken = true) {
    const payload = {
        action: action,
        token: useToken ? state.token : "",
        data: data,
    };

    let response;

    try {
        response = await fetch(API_URL, {
            method: "POST",

            redirect: "follow",

            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },

            body: JSON.stringify(payload),
        });
    } catch (error) {
        console.error("API connection error:", error);

        throw new Error("Tidak dapat terhubung ke Google Apps Script.");
    }

    const text = await response.text();

    console.log("API response:", text);

    let result;

    try {
        result = JSON.parse(text);
    } catch (error) {
        console.error("Response bukan JSON:", text);

        throw new Error("Google Apps Script mengembalikan respons yang bukan JSON.");
    }

    if (!response.ok) {
        throw new Error(result.message || `HTTP ${response.status}`);
    }

    if (!result.success && result.code === "SESSION_EXPIRED") {
        setToken("");
    }

    return result;
}
