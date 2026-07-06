"use client";

import { FaPhotoVideo } from "react-icons/fa";
import { CiText } from "react-icons/ci";
import { MdBlurOn } from "react-icons/md";
import { AiOutlineSplitCells } from "react-icons/ai";

import EffectsEditor from "./EffectsEditor";
import { v4 as uuidv4 } from "uuid";
import { useAppDetailsContext } from "../../context/useAppContext";
import { spliteLayer } from "../../utils/spliteLayer";
import ButtonBlackPrimary from "../ui/ButtonBlackPrimary";

export default function Controls() {
  const {
    clipsDetails,
    setClipsDetails,
    imagesDetails,
    setImagesDetails,
    setSelectedImageID,
    imageRefs,
    setImageRefs,
    videos,


    totalTime,

    currentTime,
    setTextsDetails,
    setSelectedTextId,
    setBlursDetails,
    setSelectedBlurId,
    setVideos,
    containerDimenions,
    setMediaImportError,
    audioDetails,
    setAudioDetails,
  } = useAppDetailsContext();

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = clipsDetails.length > 0 ? "image/*, video/mp4" : "video/mp4";
    input.multiple = true;
    input.click();

    input.onchange = (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files) {
        const newImagesDetails = [...imagesDetails];
        const newImageRefs = { ...imageRefs };

        Array.from(files).forEach((file, index) => {
          const imgElement = new Image();
          imgElement.src = URL.createObjectURL(file);

          imgElement.onload = () => {
            newImageRefs[index] = imgElement;
            const id = uuidv4();
            // Convert file to base64
            const reader = new FileReader();
            reader.onload = () => {
              const imageDetails = {
                id: id,
                src: imgElement.src,
                image: file,
                opacity: 1,
                imageX: index * 100,
                imageY: 0,
                width: imgElement.width,
                height: imgElement.height,
                scaleX: 0.4,
                scaleY: 0.4,
                startTime: 0,
                endTime: totalTime,
                animation: "none",
              };

              newImagesDetails.push(imageDetails);
              setImagesDetails([...newImagesDetails]);
              setImageRefs({ ...newImageRefs });
              setSelectedImageID(id);
            };
            reader.readAsDataURL(file);
          };
          if (file.type.startsWith("video/")) {
            setMediaImportError("");
            setVideos((prevVideos) => [
              ...prevVideos,
              {
                video: file,
                name: `video${prevVideos.length + 1}`, // always based on current array size
              },
            ]);
          }
        });
      }
    };
  };

  const sections = [
    {
      section: "Import",
      buttons: [
        {
          name: "Import Media",
          icon: <FaPhotoVideo size={18} />,
          action: handleUpload,
        },
      ],
      havingRange: false,
      havingRadio: false,
      havingRenderButton: false,
    },
    {
      section: "Effects",
      buttons: [
        {
          name: "Text",
          icon: <CiText size={18} />,
          action: () => {
            const newText = {
              text: "New Text",
              textColor: "white",
              backgroundColor: "transparent",
              shadowColor: "transparent",
              shadowBlur: 0,
              shadowOffsetX: 3,
              shadowOffsetY: 1,

              fontFamily: "Arial",
              textX: (containerDimenions.width - 220) / 2,
              textY: (containerDimenions.height - 100) / 2,
              width: 220,
              height: 100,
              fontSize: 100,
              lineHeight: 1,
              isBold: false,
              isItalic: false,
              isUnderline: false,
              opacity: 1,
              id: uuidv4(),
              startTime: 0,
              endTime: totalTime || 100,
              animation: "none",
            };

            setTextsDetails((prevDetails) => [...prevDetails, newText]);
            setSelectedTextId(newText.id);
          },
        },
        {
          name: "Blur",
          icon: <MdBlurOn size={18} />,
          action: () => {
            const newBlur = {
              id: uuidv4(),
              x: (containerDimenions.width - 200) / 2,
              y: 100,
              width: 400,
              height: 200,
              blurAmount: 10,
              startTime: 0,
              endTime: totalTime,
            };
            setBlursDetails((prev) => [...prev, newBlur]);
            setSelectedBlurId(newBlur.id);
          },
        },
        {
          name: "split",
          icon: (
            <AiOutlineSplitCells size={18} />
          ),
          action: () =>
            spliteLayer(null, clipsDetails, setClipsDetails, currentTime, audioDetails, setAudioDetails),
        },
      ],
    },
  ];

  return (
    <div
      className={` text-gray-600 grid overflow-hidden grid-rows-[0.5fr,0.5fr] gap-[2px]   ${
        "text-[11px]"
      } shadow-2xl`}
    >
      <div className="  grid  bg-[#ededed] overflow-auto scrollbar-thin  ">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="p-2 flex flex-col gap-7">
            {section.section}
            <div className="flex gap-5 justify-start">
              {section.buttons.map((button, buttonIndex) => (
                <ButtonBlackPrimary
                  key={+buttonIndex}
                  disabled={
                    button.name !== "Import Media" && videos.length === 0
                  }
                  onClick={button.action}
                >
                  {button.name}
                  {button.icon}
                </ButtonBlackPrimary>
              ))}
            </div>
          </div>
        ))}
      </div>
      <EffectsEditor />
    </div>
  );
}
