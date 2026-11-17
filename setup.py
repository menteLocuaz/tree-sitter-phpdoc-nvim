from os.path import isdir, join
from platform import system

from setuptools import Extension, find_packages, setup
from setuptools.command.build import build
from wheel.bdist_wheel import bdist_wheel

# --- Configuration Constants ---
PACKAGE_NAME = "tree_sitter_phpdoc"
PYTHON_BINDINGS_DIR = "bindings/python"
C11_ARGS = ["-std=c11"]
WINDOWS_C11_ARGS = ["/std:c11", "/utf-8"]
LIMITED_API_VERSION = "0x03080000"


class Build(build):
    """Customizes the build process to package the query files."""
    def run(self):
        if isdir("queries"):
            dest = join(self.build_lib, PACKAGE_NAME, "queries")
            self.copy_tree("queries", dest)
        super().run()


class BdistWheel(bdist_wheel):
    """Forces compatibility with the limited API (abi3) for Python 3.8+."""
    def get_tag(self):
        python, abi, platform = super().get_tag()
        if python.startswith("cp"):
            python, abi = "cp38", "abi3"
        return python, abi, platform


# --- Modular Component Definitions ---
ext_modules = [
    Extension(
        name="_binding",
        sources=[
            f"{PYTHON_BINDINGS_DIR}/{PACKAGE_NAME}/binding.c",
            "src/parser.c",
            # NOTE: If your language uses an external scanner, add it here.
        ],
        extra_compile_args=WINDOWS_C11_ARGS if system() == "Windows" else C11_ARGS,
        define_macros=[
            ("Py_LIMITED_API", LIMITED_API_VERSION),
            ("PY_SSIZE_T_CLEAN", None),
        ],
        include_dirs=["src"],
        py_limited_api=True,
    )
]

package_data = {
    PACKAGE_NAME: ["*.pyi", "py.typed"],
    f"{PACKAGE_NAME}.queries": ["*.scm"],
}


def main():
    setup(
        packages=find_packages(PYTHON_BINDINGS_DIR),
        package_dir={"": PYTHON_BINDINGS_DIR},
        package_data=package_data,
        ext_package=PACKAGE_NAME,
        ext_modules=ext_modules,
        cmdclass={
            "build": Build,
            "bdist_wheel": BdistWheel,
        },
        zip_safe=False,
    )


if __name__ == "__main__":
    main()
