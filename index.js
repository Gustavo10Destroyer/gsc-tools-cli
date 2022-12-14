const fs = require("fs");
const path = require("path");
const { ArgumentParser } = require("argparse");
const { version } = require("./package.json");
const child_process = require("child_process");
const { createExtractorFromFile } = require("node-unrar-js");
const chokidar = require("chokidar");

// Extract File function
const extractRARFile = async (file, destination) => {
    try {
        const extractor = await createExtractorFromFile({
            filepath: file,
            targetPath: destination
        });

        [...extractor.extract().files];
    } catch (err) {
        console.error(err);
    }
};

const compile = (canExit) => {
    if(!fs.existsSync(path.join(process.cwd(), "gsc.json"))) {
        console.log("Não foi possível encontrar o arquivo de descrição do projeto.");
        process.exit(1);
    }

    fs.readFile(path.join(process.cwd(), "gsc.json"), (err, data) => {
        try {
            data = JSON.parse(data);
        } catch(e) {
            console.log("O arquivo de descrição do projeto está corrompido.");
            console.error(e);
            process.exit(1);
        }

        if(!data.name) {
            console.log("O arquivo de descrição do projeto está corrompido.");
            process.exit(1);
        }

        if(!data.destination) {
            data.destination = path.join(process.cwd(), "build/");
        }

        if(!data.compiler) {
            data.compiler = path.join(process.cwd(), "compiler/Compiler.exe");
        }

        if(!fs.existsSync(data.compiler)) {
            console.log("Não foi possível encontrar o compilador.");
            process.exit(1);
        }

        if(!fs.existsSync(data.destination)) {
            fs.mkdirSync(data.destination);
        }

        fs.readdir(path.join(process.cwd(), "src/"), (err, files) => {
            if(err) {
                console.log("Erro ao ler a pasta de código fonte.");
                console.error(err);
                process.exit(1);
            }

            let includes = "";
            let fullSource = "";

            files.forEach((file) => {
                if(file.endsWith(".gsc")) {
                    let source = fs.readFileSync(path.join(process.cwd(), "src/", file), "utf8").split("\n");

                    source.forEach((line) => {
                        if(line.startsWith("#include")) {
                            includes += line + "\n";
                        } else {
                            fullSource += line + "\n";
                        }
                    });
                }
            });

            if(!fs.existsSync(path.join(process.cwd(), "build/"))) {
                fs.mkdirSync(path.join(process.cwd(), "build/"));
            }

            fs.writeFile(path.join(process.cwd(), "build/" + data.name + ".gsc"), includes + "\n" + fullSource, (err) => {
                if(err) {
                    console.log("Erro ao compilar o código fonte.");
                    console.error(err);
                    if(canExit) process.exit(1);
                }

                let compiler = child_process.spawn(data.compiler, [path.join(process.cwd(), "build/", data.name + ".gsc")]);

                compiler.stdout.on("data", (data) => {
                    console.log(data.toString());
                });

                compiler.stderr.on("data", (data) => {
                    console.error(data.toString());
                });

                if(fs.existsSync(path.join(process.cwd(), data.name + "-compiled.gsc"))) {
                    fs.unlinkSync(path.join(process.cwd(), data.name + "-compiled.gsc"));
                }

                compiler.once("close", (code) => {
                    if(!fs.existsSync(path.join(process.cwd(), data.name + "-compiled.gsc"))) {
                        // Não encontrou o arquivo compilado
                        console.log("Erro ao compilar o código fonte.");
                        if(canExit) process.exit(1);
                        return;
                    }

                    console.log("Código fonte compilado com sucesso!");

                    fs.rename(path.join(process.cwd(), data.name + "-compiled.gsc"), path.join(process.cwd(), "dist/", data.name + ".gsc"), (err) => {
                        if(err) {
                            console.log("Erro ao mover o arquivo compilado.");
                            console.error(err);
                            process.exit(1);
                        }

                        // Copiar o arquivo compilado para a pasta de destino
                        fs.copyFile(path.join(process.cwd(), "dist/", data.name + ".gsc"), data.destination + "/" + data.name + ".gsc", (err) => {
                            if(err) {
                                console.log("Erro ao copiar o arquivo compilado para a pasta de destino.");
                                console.error(err);
                                process.exit(1);
                            }

                            console.log("Arquivo compilado movido com sucesso!");
                        });
                    });
                });

                if(!fs.existsSync(path.join(process.cwd(), "dist/"))) {
                    fs.mkdirSync(path.join(process.cwd(), "dist/"));
                }
            });
        });
    });
};

const parser = new ArgumentParser({
    description: "GSC Tools CLI"
});

const INITIAL_HEADERS = [
    "#include maps\\mp\\_utility;",
    "#include common_scripts\\utility;",
    "#include maps\\mp\\gametypes_zm\\_hud_util;",
    "#include maps\\mp\\gametypes_zm\\_hud_message;",
    "",
    "init()",
    "{",
    "    level thread onPlayerConnect();",
    "}",
    "",
    "onPlayerConnect()",
    "{",
    "    for(;;)",
    "    {",
    "        level waittill(\"connected\", player);",
    "        player thread onPlayerSpawned();",
    "    }",
    "}",
    "",
    "onPlayerSpawned()",
    "{",
    "    self endon(\"disconnect\");",
    "    level endon(\"game_ended\");",
    "",
    "    for(;;)",
    "    {",
    "        self waittill(\"spawned_player\");",
    "",
    "        self IPrintLn(\"GSC Tools CLI - v" + version + "\");",
    "    }",
    "}"
];

parser.add_argument("-v", "--version", {
    action: "version",
    version: `GSC Tools CLI - v${version}`
});

parser.add_argument("command", {
    help: "O comando a ser executado"
});

parser.add_argument("args", {
    nargs: "*",
    help: "Argumentos para o comando"
});

let args = parser.parse_args();

if(!args.command) {
    parser.print_help();
    process.exit(1);
}

switch(args.command) {
    case "criar":
    case "create":
        let name = args.args[0];

        if(!name) {
            console.log("Você precisa informar um nome para o projeto.");
            process.exit(1);
        }

        let description = {
            name,
            destination: "./dist",
            compiler: "./compiler/Compiler.exe"
        };

        fs.mkdir(name, (err) => {
            if(err) {
                console.log("Erro ao criar o diretório do projeto.");
                console.error(err);
                process.exit(1);
            }

            extractRARFile(path.join(__dirname, "compiler.rar"), name + "/compiler");

            fs.writeFile(name + "/gsc.json", JSON.stringify(description, null, 4), (err) => {
                if(err) {
                    console.log("Erro ao criar o arquivo de descrição do projeto.");
                    console.error(err);
                    process.exit(1);
                }
    
                fs.mkdir(name + "/src", (err) => {
                    if(err) {
                        console.log("Erro ao criar a pasta de código fonte.");
                        console.error(err);
                        process.exit(1);
                    }
    
                    fs.writeFile(name + "/src/main.gsc", INITIAL_HEADERS.join("\n"), (err) => {
                        if(err) {
                            console.log("Erro ao criar o arquivo principal.");
                            console.error(err);
                            process.exit(1);
                        }
    
                        console.log("Projeto criado com sucesso!");
                    });
                });
            });
        });

        break;
    case "build":
    case "compile":
    case "compilar":
        compile(true);

        break;
    case "watch":
    case "observar":
        if(!fs.existsSync("gsc.json")) {
            console.log("Não foi possível encontrar o arquivo de descrição do projeto.");
            process.exit(1);
        }

        let lastBuild = 0;

        let watcher = chokidar.watch(path.join(process.cwd(), "src/"), {
            persistent: true
        });

        watcher.on("change", (path) => {
            if(!path.endsWith(".gsc")) return;

            if(Date.now() - lastBuild >= 1000) {
                lastBuild = Date.now();

                console.log("Arquivo modificado, recompilando...");
                compile();
            }
        });

        break;
    default:
        console.log("Comando inválido. Use 'gsc --help' para ver a lista de comandos.");
        process.exit(1);
}