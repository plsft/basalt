// Prevent additional Windows console; lib's `run` is the entrypoint.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    basalt_desktop_lib::run();
}
