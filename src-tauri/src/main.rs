fn main() {
    if nuomi_switch_lib::try_run_working_light_cli() {
        return;
    }

    nuomi_switch_lib::run();
}
