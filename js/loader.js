const mensajes = [

    "Inicializando impresora...",
    "Preparando filamento PLA...",
    "Calentando boquilla...",
    "Fabricando capa por capa...",
    "Dándole vida a tu próxima idea...",
    "Producto terminado."

];


const loaderText = document.getElementById("loader-text");
const loader = document.getElementById("loader");
const home = document.getElementById("home-content");


let index = 0;


function mostrarMensajes() {

    if (index < mensajes.length) {

        loaderText.textContent = mensajes[index];

        index++;

        setTimeout(mostrarMensajes, 400);

    }

    else {

        setTimeout(() => {

            loaderText.innerHTML = `
                Diseñado en Colombia.<br>
                Impreso capa por capa.
            `;

        }, 300);



        setTimeout(() => {

            loader.classList.add("fade-out");

        }, 1200);



        setTimeout(() => {

            loader.style.display = "none";

            home.style.display = "block";

            document.body.style.overflow = "auto";

        }, 2200);


    }

}


window.addEventListener("load", () => {

    document.body.style.overflow = "hidden";

    mostrarMensajes();

});